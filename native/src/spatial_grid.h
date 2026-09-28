#ifndef SPATIAL_GRID_H
#define SPATIAL_GRID_H

#include <vector>
#include <cstdint>
#include <cmath>
#include <algorithm>

#if defined(__AVX2__)
#include <immintrin.h>
#endif

namespace project_steam {

struct EntityRecord {
    int32_t id;
    int32_t type; // 1 = player, 2 = mob
    float x;
    float z;
    float hp;
    bool dead;
};

struct GridCell {
    std::vector<int32_t> entityIndices;
};

class NativeSpatialGrid {
public:
    NativeSpatialGrid(float minX = -4096.0f, float minZ = -4096.0f,
                      float maxX = 4096.0f, float maxZ = 4096.0f,
                      float cellSize = 72.0f)
        : m_minX(minX), m_minZ(minZ), m_maxX(maxX), m_maxZ(maxZ), m_cellSize(cellSize)
    {
        if (m_cellSize <= 0.0f) m_cellSize = 72.0f;
        m_invCellSize = 1.0f / m_cellSize;
        m_cols = static_cast<int32_t>(std::ceil((m_maxX - m_minX) * m_invCellSize));
        m_rows = static_cast<int32_t>(std::ceil((m_maxZ - m_minZ) * m_invCellSize));
        if (m_cols < 1) m_cols = 1;
        if (m_rows < 1) m_rows = 1;
        m_cells.resize(m_cols * m_rows);
        m_entities.reserve(4096);
    }

    void clear() {
        for (int32_t idx : m_activeCells) {
            m_cells[idx].entityIndices.clear();
        }
        m_activeCells.clear();
        m_entities.clear();
    }

    inline int32_t getCellIndex(float x, float z) const {
        int32_t cx = static_cast<int32_t>((x - m_minX) * m_invCellSize);
        int32_t cz = static_cast<int32_t>((z - m_minZ) * m_invCellSize);
        if (cx < 0 || cx >= m_cols || cz < 0 || cz >= m_rows) return -1;
        return cz * m_cols + cx;
    }

    int32_t insert(int32_t id, int32_t type, float x, float z, float hp = 100.0f, bool dead = false) {
        int32_t cellIdx = getCellIndex(x, z);
        if (cellIdx < 0) return -1;

        int32_t entityIdx = static_cast<int32_t>(m_entities.size());
        m_entities.push_back({ id, type, x, z, hp, dead });

        GridCell& cell = m_cells[cellIdx];
        if (cell.entityIndices.empty()) {
            m_activeCells.push_back(cellIdx);
        }
        cell.entityIndices.push_back(entityIdx);
        return entityIdx;
    }

    void bulkInsert(const float* transformData, int32_t count) {
        // transformData: compact array, 8 floats per entity:
        // [0]: x, [1]: y, [2]: z, [3]: hp, [4]: maxHp, [5]: speed, [6]: type, [7]: id
        for (int32_t i = 0; i < count; ++i) {
            int32_t offset = i * 8;
            float x = transformData[offset + 0];
            float z = transformData[offset + 2];
            float hp = transformData[offset + 3];
            int32_t type = static_cast<int32_t>(transformData[offset + 6]);
            int32_t id = static_cast<int32_t>(transformData[offset + 7]);
            bool dead = (hp <= 0.0f);
            insert(id, type, x, z, hp, dead);
        }
    }

    bool hasPlayerNear(float x, float z, float radius, float r2 = -1.0f, bool includeDead = false) const {
        float maxDist2 = (r2 >= 0.0f) ? r2 : (radius * radius);

        int32_t minCx = std::max(0, static_cast<int32_t>((x - radius - m_minX) * m_invCellSize));
        int32_t maxCx = std::min(m_cols - 1, static_cast<int32_t>((x + radius - m_minX) * m_invCellSize));
        int32_t minCz = std::max(0, static_cast<int32_t>((z - radius - m_minZ) * m_invCellSize));
        int32_t maxCz = std::min(m_rows - 1, static_cast<int32_t>((z + radius - m_minZ) * m_invCellSize));

        for (int32_t cz = minCz; cz <= maxCz; ++cz) {
            int32_t rowOffset = cz * m_cols;
            for (int32_t cx = minCx; cx <= maxCx; ++cx) {
                const GridCell& cell = m_cells[rowOffset + cx];
                if (cell.entityIndices.empty()) continue;

                for (int32_t eIdx : cell.entityIndices) {
                    const EntityRecord& ent = m_entities[eIdx];
                    if (ent.type != 1) continue; // Only players
                    if (!includeDead && (ent.dead || ent.hp <= 0.0f)) continue;

                    float dx = ent.x - x;
                    float dz = ent.z - z;
                    if ((dx * dx + dz * dz) <= maxDist2) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    int32_t queryRadius(float x, float z, float radius,
                        int32_t* outPlayerIds, int32_t maxPlayers,
                        int32_t* outMobIds, int32_t maxMobs,
                        int32_t& foundPlayers, int32_t& foundMobs) const
    {
        float maxDist2 = radius * radius;
        foundPlayers = 0;
        foundMobs = 0;

        int32_t minCx = std::max(0, static_cast<int32_t>((x - radius - m_minX) * m_invCellSize));
        int32_t maxCx = std::min(m_cols - 1, static_cast<int32_t>((x + radius - m_minX) * m_invCellSize));
        int32_t minCz = std::max(0, static_cast<int32_t>((z - radius - m_minZ) * m_invCellSize));
        int32_t maxCz = std::min(m_rows - 1, static_cast<int32_t>((z + radius - m_minZ) * m_invCellSize));

        for (int32_t cz = minCz; cz <= maxCz; ++cz) {
            int32_t rowOffset = cz * m_cols;
            for (int32_t cx = minCx; cx <= maxCx; ++cx) {
                const GridCell& cell = m_cells[rowOffset + cx];
                if (cell.entityIndices.empty()) continue;

                const size_t numEntities = cell.entityIndices.size();
                size_t i = 0;

#if defined(__AVX2__)
                // Векторная обработка AVX2 (по 8 сущностей за шаг)
                __m256 v_target_x = _mm256_set1_ps(x);
                __m256 v_target_z = _mm256_set1_ps(z);
                __m256 v_maxDist2 = _mm256_set1_ps(maxDist2);

                for (; i + 8 <= numEntities; i += 8) {
                    alignas(32) float cand_x[8];
                    alignas(32) float cand_z[8];
                    int32_t cand_indices[8];

                    for (int k = 0; k < 8; ++k) {
                        int32_t eIdx = cell.entityIndices[i + k];
                        cand_indices[k] = eIdx;
                        cand_x[k] = m_entities[eIdx].x;
                        cand_z[k] = m_entities[eIdx].z;
                    }

                    __m256 v_cx = _mm256_load_ps(cand_x);
                    __m256 v_cz = _mm256_load_ps(cand_z);
                    __m256 v_dx = _mm256_sub_ps(v_cx, v_target_x);
                    __m256 v_dz = _mm256_sub_ps(v_cz, v_target_z);
                    __m256 v_d2 = _mm256_add_ps(_mm256_mul_ps(v_dx, v_dx), _mm256_mul_ps(v_dz, v_dz));
                    __m256 v_mask = _mm256_cmp_ps(v_d2, v_maxDist2, _CMP_LE_OQ);
                    int mask = _mm256_movemask_ps(v_mask);

                    if (mask != 0) {
                        for (int k = 0; k < 8; ++k) {
                            if (mask & (1 << k)) {
                                const EntityRecord& ent = m_entities[cand_indices[k]];
                                if (ent.type == 1 && outPlayerIds && foundPlayers < maxPlayers) {
                                    outPlayerIds[foundPlayers++] = ent.id;
                                } else if (ent.type == 2 && outMobIds && foundMobs < maxMobs) {
                                    outMobIds[foundMobs++] = ent.id;
                                }
                            }
                        }
                    }
                }
#endif
                // Скалярная обработка остатка
                for (; i < numEntities; ++i) {
                    int32_t eIdx = cell.entityIndices[i];
                    const EntityRecord& ent = m_entities[eIdx];
                    float dx = ent.x - x;
                    float dz = ent.z - z;
                    if ((dx * dx + dz * dz) <= maxDist2) {
                        if (ent.type == 1 && outPlayerIds && foundPlayers < maxPlayers) {
                            outPlayerIds[foundPlayers++] = ent.id;
                        } else if (ent.type == 2 && outMobIds && foundMobs < maxMobs) {
                            outMobIds[foundMobs++] = ent.id;
                        }
                    }
                }
            }
        }
        return foundPlayers + foundMobs;
    }

    size_t getActiveCellCount() const { return m_activeCells.size(); }
    size_t getEntityCount() const { return m_entities.size(); }

private:
    float m_minX, m_minZ, m_maxX, m_maxZ;
    float m_cellSize;
    float m_invCellSize;
    int32_t m_cols;
    int32_t m_rows;
    std::vector<GridCell> m_cells;
    std::vector<int32_t> m_activeCells;
    std::vector<EntityRecord> m_entities;
};

} // namespace project_steam

#endif // SPATIAL_GRID_H
