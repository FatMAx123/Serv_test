# ============================================================
#  SCRIPTS / MARKET-SQUARE / TERRAIN_UV.PY
#  Точное соответствие «мир ↔ пиксель карты покраски террейна».
#
#  Игра кладёт terrain-paint-*.png на террейн НЕ по мировой сетке, а по UV-развёртке меша
#  (TerrainData.uvs из data/mesh/terrain.bin; шейдер берёт texture2D(uPaintMap1, vMapUv),
#  DataTexture с flipY=false: строка карты = v·N). Развёртка нелинейна: у рынка она сдвинута
#  относительно «(x−minX)/W, 1−(z−minZ)/H» на ~45 м по Z и ~8 м по X, по острову — до 110 м.
#  Поэтому всё, что рисует или читает покраску, считает через треугольники меша:
#    мир → UV: барицентрика в треугольнике под точкой;
#    UV → мир: растеризация треугольников в UV-пространстве.
#  Источник — client/js/terrain-data.js (совпадает с terrain.bin до 3e-8).
# ============================================================
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
N = 1024


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class TerrainUV:
    def __init__(self, path=None):
        path = path or os.path.join(ROOT, 'client', 'js', 'terrain-data.js')
        src = open(path, encoding='utf-8').read()
        d = json.loads(src[src.index('{'):src.rindex('}') + 1])
        P3 = np.asarray(d['positions'], np.float64).reshape(-1, 3)
        self.P = P3[:, [0, 2]]
        self.Y = P3[:, 1]
        self.U = np.asarray(d['uvs'], np.float64).reshape(-1, 2)
        self.T = np.asarray(d['indices'], np.int64).reshape(-1, 3)
        tp = self.P[self.T]                       # (nt, 3, 2) мировые xz вершин
        tu = self.U[self.T]                       # (nt, 3, 2) uv вершин
        self.tri_w = tp
        self.tri_u = tu
        self.wmin, self.wmax = tp.min(1), tp.max(1)
        self.umin, self.umax = tu.min(1), tu.max(1)

    # ---------------------------------------------------------- общий растеризатор
    @staticmethod
    def _bary(A, B, C, px, pz):
        den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
        if abs(den) < 1e-14:
            return None
        l1 = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (pz - C[1])) / den
        l2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (pz - C[1])) / den
        return l1, l2, 1.0 - l1 - l2

    def _grid(self, src_tri, dst_tri, smin, smax, xs, ys):
        """Регулярная сетка xs×ys в пространстве src → значения dst (nan, где нет треугольника)."""
        out0 = np.full((len(ys), len(xs)), np.nan)
        out1 = np.full((len(ys), len(xs)), np.nan)
        sel = np.nonzero((smax[:, 0] >= xs[0]) & (smin[:, 0] <= xs[-1]) & (smax[:, 1] >= ys[0]) & (smin[:, 1] <= ys[-1]))[0]
        eps = 1e-9
        for t in sel:
            A, B, C = src_tri[t]
            i0, i1 = np.searchsorted(xs, smin[t, 0]), np.searchsorted(xs, smax[t, 0], 'right')
            j0, j1 = np.searchsorted(ys, smin[t, 1]), np.searchsorted(ys, smax[t, 1], 'right')
            if i0 >= i1 or j0 >= j1:
                continue
            PX, PY = np.meshgrid(xs[i0:i1], ys[j0:j1])
            b = self._bary(A, B, C, PX, PY)
            if b is None:
                continue
            l1, l2, l3 = b
            m = (l1 >= -eps) & (l2 >= -eps) & (l3 >= -eps)
            if not m.any():
                continue
            D = dst_tri[t]
            v0 = l1 * D[0, 0] + l2 * D[1, 0] + l3 * D[2, 0]
            v1 = l1 * D[0, 1] + l2 * D[1, 1] + l3 * D[2, 1]
            s0 = out0[j0:j1, i0:i1]
            s1 = out1[j0:j1, i0:i1]
            s0[m] = v0[m]
            s1[m] = v1[m]
        return out0, out1

    def world_grid_uv(self, xs, zs):
        """Мировая сетка (xs по X, zs по Z, по возрастанию) → (U, V), форма (len(zs), len(xs))."""
        return self._grid(self.tri_w, self.tri_u, self.wmin, self.wmax, np.asarray(xs, float), np.asarray(zs, float))

    def uv_grid_world(self, us, vs):
        """UV-сетка (us, vs по возрастанию) → мировые (X, Z), форма (len(vs), len(us))."""
        return self._grid(self.tri_u, self.tri_w, self.umin, self.umax, np.asarray(us, float), np.asarray(vs, float))

    def _interp(self, x, z, vals):
        """Значения в вершинах меша vals (nv, k) → в произвольных точках (barycentric), nan вне меша."""
        x = np.asarray(x, float)
        z = np.asarray(z, float)
        fx, fz = x.ravel(), z.ravel()
        out = np.full((fx.size, vals.shape[1]), np.nan)
        if fx.size == 0:
            return out.reshape(x.shape + (vals.shape[1],))
        sel = np.nonzero((self.wmax[:, 0] >= fx.min()) & (self.wmin[:, 0] <= fx.max()) &
                         (self.wmax[:, 1] >= fz.min()) & (self.wmin[:, 1] <= fz.max()))[0]
        order = np.argsort(fx)
        sx = fx[order]
        for t in sel:
            a, b = np.searchsorted(sx, self.wmin[t, 0]), np.searchsorted(sx, self.wmax[t, 0], 'right')
            if a >= b:
                continue
            idx = order[a:b]
            idx = idx[(fz[idx] >= self.wmin[t, 1]) & (fz[idx] <= self.wmax[t, 1])]
            if idx.size == 0:
                continue
            A, B, C = self.tri_w[t]
            bc = self._bary(A, B, C, fx[idx], fz[idx])
            if bc is None:
                continue
            l1, l2, l3 = bc
            m = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
            idx = idx[m]
            tv = vals[self.T[t]]
            out[idx] = l1[m, None] * tv[0] + l2[m, None] * tv[1] + l3[m, None] * tv[2]
        return out.reshape(x.shape + (vals.shape[1],))

    def world_to_uv(self, x, z):
        """Произвольные точки → (U, V) той же формы (nan вне меша)."""
        r = self._interp(x, z, self.U)
        return r[..., 0], r[..., 1]

    def heights(self, x, z):
        """Высота поверхности меша террейна (как TerrainHeight.groundY для пологих мест)."""
        return self._interp(x, z, self.Y[:, None])[..., 0]

    # ---------------------------------------------------------- пиксели карты
    @staticmethod
    def px_rect(U, V, pad=2):
        """Прямоугольник пикселей (px0, px1, py0, py1), покрывающий точки UV с запасом."""
        u, v = U[np.isfinite(U)], V[np.isfinite(V)]
        return (max(0, int(np.floor(u.min() * N)) - pad), min(N, int(np.ceil(u.max() * N)) + pad),
                max(0, int(np.floor(v.min() * N)) - pad), min(N, int(np.ceil(v.max() * N)) + pad))

    def pixel_world(self, px0, px1, py0, py1, ss=4):
        """Мировые координаты подвыборок пикселей прямоугольника: (X, Z) формы (h·ss, w·ss).
        Пиксель (i, j) покрывает u ∈ [i/N, (i+1)/N), v ∈ [j/N, (j+1)/N) — строка карты = v·N."""
        us = (np.arange(px0 * ss, px1 * ss) + 0.5) / (N * ss)
        vs = (np.arange(py0 * ss, py1 * ss) + 0.5) / (N * ss)
        return self.uv_grid_world(us, vs)


def sample(img, U, V):
    """Как GPU: билинейно по текселям, ClampToEdge. img — (N, N[, C]) float; U, V — массивы."""
    fx = np.nan_to_num(U, nan=-1.0) * N - 0.5
    fy = np.nan_to_num(V, nan=-1.0) * N - 0.5
    fx = np.clip(fx, 0, N - 1.0001)
    fy = np.clip(fy, 0, N - 1.0001)
    i0 = np.floor(fx).astype(int)
    j0 = np.floor(fy).astype(int)
    tx, ty = fx - i0, fy - j0
    if img.ndim == 3:
        tx, ty = tx[..., None], ty[..., None]
    return (img[j0, i0] * (1 - tx) * (1 - ty) + img[j0, i0 + 1] * tx * (1 - ty) +
            img[j0 + 1, i0] * (1 - tx) * ty + img[j0 + 1, i0 + 1] * tx * ty)


def visible_layers(p1, U, V):
    """Видимая доля слоёв покраски в точке, как в шейдере террейна:
    blendFactor = smoothstep(0.01, 0.6, сумма весов), слой = вес/сумма · blendFactor.
    p1 — RGBA карта terrain-paint-1 (0..255). Возвращает (..., 4)."""
    w = sample(p1 / 255.0, U, V)
    tot = w.sum(-1, keepdims=True)
    bf = smooth(0.01, 0.6, tot)
    return np.where(tot > 1e-6, w / np.maximum(tot, 1e-6) * bf, 0.0)
