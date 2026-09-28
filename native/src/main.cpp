#include <node_api.h>
#include <stdio.h>
#include "spatial_grid.h"
#include "combat_engine.h"

using namespace project_steam;

static FastRng g_combatRng(123456789ULL);
static napi_ref constructor_ref;

struct GridWrap {
    NativeSpatialGrid* grid;
};

static void GridDestructor(napi_env env, void* nativeObject, void* finalize_hint) {
    GridWrap* wrap = reinterpret_cast<GridWrap*>(nativeObject);
    if (wrap) {
        delete wrap->grid;
        delete wrap;
    }
}

static napi_value GridConstructor(napi_env env, napi_callback_info info) {
    napi_value jsthis;
    size_t argc = 5;
    napi_value args[5];
    napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);

    double minX = -4096.0, minZ = -4096.0, maxX = 4096.0, maxZ = 4096.0, cellSize = 72.0;
    if (argc >= 1) napi_get_value_double(env, args[0], &minX);
    if (argc >= 2) napi_get_value_double(env, args[1], &minZ);
    if (argc >= 3) napi_get_value_double(env, args[2], &maxX);
    if (argc >= 4) napi_get_value_double(env, args[3], &maxZ);
    if (argc >= 5) napi_get_value_double(env, args[4], &cellSize);

    GridWrap* wrap = new GridWrap();
    wrap->grid = new NativeSpatialGrid(
        static_cast<float>(minX), static_cast<float>(minZ),
        static_cast<float>(maxX), static_cast<float>(maxZ),
        static_cast<float>(cellSize)
    );

    napi_wrap(env, jsthis, wrap, GridDestructor, NULL, NULL);
    return jsthis;
}

static napi_value GridClear(napi_env env, napi_callback_info info) {
    napi_value jsthis;
    napi_get_cb_info(env, info, NULL, NULL, &jsthis, NULL);

    GridWrap* wrap = nullptr;
    napi_unwrap(env, jsthis, reinterpret_cast<void**>(&wrap));
    if (wrap && wrap->grid) {
        wrap->grid->clear();
    }
    return NULL;
}

static napi_value GridInsert(napi_env env, napi_callback_info info) {
    napi_value jsthis;
    size_t argc = 6;
    napi_value args[6];
    napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);

    GridWrap* wrap = nullptr;
    napi_unwrap(env, jsthis, reinterpret_cast<void**>(&wrap));
    if (!wrap || !wrap->grid || argc < 4) return NULL;

    int32_t id = 0, type = 1;
    double x = 0, z = 0, hp = 100;
    bool dead = false;

    napi_get_value_int32(env, args[0], &id);
    napi_get_value_int32(env, args[1], &type);
    napi_get_value_double(env, args[2], &x);
    napi_get_value_double(env, args[3], &z);
    if (argc >= 5) napi_get_value_double(env, args[4], &hp);
    if (argc >= 6) napi_get_value_bool(env, args[5], &dead);

    int32_t idx = wrap->grid->insert(id, type, static_cast<float>(x), static_cast<float>(z),
                                     static_cast<float>(hp), dead);

    napi_value result;
    napi_create_int32(env, idx, &result);
    return result;
}

static napi_value GridBulkInsert(napi_env env, napi_callback_info info) {
    napi_value jsthis;
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);

    GridWrap* wrap = nullptr;
    napi_unwrap(env, jsthis, reinterpret_cast<void**>(&wrap));
    if (!wrap || !wrap->grid || argc < 2) return NULL;

    void* data = nullptr;
    napi_typedarray_type type;
    size_t length = 0;

    napi_get_typedarray_info(env, args[0], &type, &length, &data, NULL, NULL);
    int32_t count = 0;
    napi_get_value_int32(env, args[1], &count);

    if (data && count > 0 && type == napi_float32_array) {
        wrap->grid->bulkInsert(reinterpret_cast<const float*>(data), count);
    }
    return NULL;
}

static napi_value GridHasPlayerNear(napi_env env, napi_callback_info info) {
    napi_value jsthis;
    size_t argc = 5;
    napi_value args[5];
    napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);

    GridWrap* wrap = nullptr;
    napi_unwrap(env, jsthis, reinterpret_cast<void**>(&wrap));
    if (!wrap || !wrap->grid || argc < 3) {
        napi_value falseVal;
        napi_get_boolean(env, false, &falseVal);
        return falseVal;
    }

    double x = 0, z = 0, radius = 0, r2 = -1;
    bool includeDead = false;

    napi_get_value_double(env, args[0], &x);
    napi_get_value_double(env, args[1], &z);
    napi_get_value_double(env, args[2], &radius);
    if (argc >= 4 && args[3] != NULL) {
        napi_valuetype vt;
        napi_typeof(env, args[3], &vt);
        if (vt == napi_number) napi_get_value_double(env, args[3], &r2);
    }
    if (argc >= 5) napi_get_value_bool(env, args[4], &includeDead);

    bool res = wrap->grid->hasPlayerNear(static_cast<float>(x), static_cast<float>(z),
                                         static_cast<float>(radius), static_cast<float>(r2),
                                         includeDead);

    napi_value result;
    napi_get_boolean(env, res, &result);
    return result;
}

static napi_value GridQueryRadius(napi_env env, napi_callback_info info) {
    napi_value jsthis;
    size_t argc = 5;
    napi_value args[5];
    napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);

    GridWrap* wrap = nullptr;
    napi_unwrap(env, jsthis, reinterpret_cast<void**>(&wrap));
    if (!wrap || !wrap->grid || argc < 5) return NULL;

    double x = 0, z = 0, radius = 0;
    napi_get_value_double(env, args[0], &x);
    napi_get_value_double(env, args[1], &z);
    napi_get_value_double(env, args[2], &radius);

    void* pData = nullptr;
    size_t pLen = 0;
    napi_typedarray_type pType;
    napi_get_typedarray_info(env, args[3], &pType, &pLen, &pData, NULL, NULL);

    void* mData = nullptr;
    size_t mLen = 0;
    napi_typedarray_type mType;
    napi_get_typedarray_info(env, args[4], &mType, &mLen, &mData, NULL, NULL);

    int32_t foundPlayers = 0, foundMobs = 0;
    int32_t* outPlayers = reinterpret_cast<int32_t*>(pData);
    int32_t* outMobs = reinterpret_cast<int32_t*>(mData);

    wrap->grid->queryRadius(static_cast<float>(x), static_cast<float>(z),
                            static_cast<float>(radius),
                            outPlayers, static_cast<int32_t>(pLen),
                            outMobs, static_cast<int32_t>(mLen),
                            foundPlayers, foundMobs);

    napi_value resultObj;
    napi_create_object(env, &resultObj);

    napi_value pCountVal, mCountVal;
    napi_create_int32(env, foundPlayers, &pCountVal);
    napi_create_int32(env, foundMobs, &mCountVal);

    napi_set_named_property(env, resultObj, "players", pCountVal);
    napi_set_named_property(env, resultObj, "mobs", mCountVal);

    return resultObj;
}

static napi_value FastDistance2(napi_env env, napi_callback_info info) {
    size_t argc = 4;
    napi_value args[4];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double x1 = 0, z1 = 0, x2 = 0, z2 = 0;
    napi_get_value_double(env, args[0], &x1);
    napi_get_value_double(env, args[1], &z1);
    napi_get_value_double(env, args[2], &x2);
    napi_get_value_double(env, args[3], &z2);

    double dx = x1 - x2;
    double dz = z1 - z2;
    double dist2 = dx * dx + dz * dz;

    napi_value result;
    napi_create_double(env, dist2, &result);
    return result;
}

// --- Native Combat Engine N-API Wrappers ---
static napi_value CombatPhysicalDamage(napi_env env, napi_callback_info info) {
    size_t argc = 5;
    napi_value args[5];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double pAtk = 1.0, pDef = 1.0, skillPower = 1.0, shotMod = 1.0, randFactor = 0.0;
    if (argc >= 1) napi_get_value_double(env, args[0], &pAtk);
    if (argc >= 2) napi_get_value_double(env, args[1], &pDef);
    if (argc >= 3) napi_get_value_double(env, args[2], &skillPower);
    if (argc >= 4) napi_get_value_double(env, args[3], &shotMod);
    if (argc >= 5) napi_get_value_double(env, args[4], &randFactor);

    if (randFactor <= 0.0) {
        randFactor = g_combatRng.range(PHYS_RAND_MIN, PHYS_RAND_MAX);
    }

    int32_t dmg = NativeCombatEngine::physicalDamage(
        static_cast<float>(pAtk), static_cast<float>(pDef),
        static_cast<float>(skillPower), static_cast<float>(shotMod),
        static_cast<float>(randFactor)
    );

    napi_value result;
    napi_create_int32(env, dmg, &result);
    return result;
}

static napi_value CombatCircuitDamage(napi_env env, napi_callback_info info) {
    size_t argc = 6;
    napi_value args[6];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double cAtk = 1.0, cDef = 1.0, skillPower = 1.0, shotMod = 1.0, elementMod = 1.0, randFactor = 0.0;
    if (argc >= 1) napi_get_value_double(env, args[0], &cAtk);
    if (argc >= 2) napi_get_value_double(env, args[1], &cDef);
    if (argc >= 3) napi_get_value_double(env, args[2], &skillPower);
    if (argc >= 4) napi_get_value_double(env, args[3], &shotMod);
    if (argc >= 5) napi_get_value_double(env, args[4], &elementMod);
    if (argc >= 6) napi_get_value_double(env, args[5], &randFactor);

    if (randFactor <= 0.0) {
        randFactor = g_combatRng.range(CIRCUIT_RAND_MIN, CIRCUIT_RAND_MAX);
    }

    int32_t dmg = NativeCombatEngine::circuitDamage(
        static_cast<float>(cAtk), static_cast<float>(cDef),
        static_cast<float>(skillPower), static_cast<float>(shotMod),
        static_cast<float>(elementMod), static_cast<float>(randFactor)
    );

    napi_value result;
    napi_create_int32(env, dmg, &result);
    return result;
}

static napi_value CombatHitChance(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double acc = 0.0, eva = 0.0;
    if (argc >= 1) napi_get_value_double(env, args[0], &acc);
    if (argc >= 2) napi_get_value_double(env, args[1], &eva);

    float chance = NativeCombatEngine::hitChance(static_cast<float>(acc), static_cast<float>(eva));
    napi_value result;
    napi_create_double(env, static_cast<double>(chance), &result);
    return result;
}

static napi_value CombatBlockChance(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value args[3];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double shieldDef = 0.0, pDef = 0.0, bonusPct = 0.0;
    if (argc >= 1) napi_get_value_double(env, args[0], &shieldDef);
    if (argc >= 2) napi_get_value_double(env, args[1], &pDef);
    if (argc >= 3) napi_get_value_double(env, args[2], &bonusPct);

    float chance = NativeCombatEngine::blockChance(
        static_cast<float>(shieldDef), static_cast<float>(pDef), static_cast<float>(bonusPct)
    );
    napi_value result;
    napi_create_double(env, static_cast<double>(chance), &result);
    return result;
}

static napi_value CombatCritChancePct(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value args[3];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double dex = 20.0, bonusPct = 0.0;
    int32_t weaponType = 0;
    if (argc >= 1) napi_get_value_double(env, args[0], &dex);
    if (argc >= 2) napi_get_value_double(env, args[1], &bonusPct);
    if (argc >= 3) napi_get_value_int32(env, args[2], &weaponType);

    float crit = NativeCombatEngine::critChancePct(
        static_cast<float>(dex), static_cast<float>(bonusPct), weaponType
    );
    napi_value result;
    napi_create_double(env, static_cast<double>(crit), &result);
    return result;
}

static napi_value CombatStatBonus(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double value = 20.0;
    int32_t statType = 0;
    if (argc >= 1) napi_get_value_double(env, args[0], &value);
    if (argc >= 2) napi_get_value_int32(env, args[1], &statType);

    float bonus = NativeCombatEngine::statBonus(static_cast<float>(value), statType);
    napi_value result;
    napi_create_double(env, static_cast<double>(bonus), &result);
    return result;
}

static napi_value CombatLevelMod(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double level = 1.0;
    if (argc >= 1) napi_get_value_double(env, args[0], &level);

    float lm = NativeCombatEngine::levelMod(static_cast<float>(level));
    napi_value result;
    napi_create_double(env, static_cast<double>(lm), &result);
    return result;
}

static napi_value CombatResolveBatchAttacks(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value args[3];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (argc < 3) return NULL;

    napi_typedarray_type inType, outType;
    size_t inLen = 0, outLen = 0;
    void *inData = nullptr, *outData = nullptr;

    napi_get_typedarray_info(env, args[0], &inType, &inLen, &inData, NULL, NULL);
    napi_get_typedarray_info(env, args[1], &outType, &outLen, &outData, NULL, NULL);

    int32_t count = 0;
    napi_get_value_int32(env, args[2], &count);

    if (inData && outData && count > 0 &&
        inType == napi_float32_array && outType == napi_int32_array &&
        inLen >= static_cast<size_t>(count * 12) &&
        outLen >= static_cast<size_t>(count * 4)) {
        NativeCombatEngine::resolveBatchAttacks(
            reinterpret_cast<const float*>(inData),
            reinterpret_cast<int32_t*>(outData),
            count,
            g_combatRng
        );
    }

    napi_value result;
    napi_create_int32(env, count, &result);
    return result;
}

static napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor gridMethods[] = {
        { "clear", NULL, GridClear, NULL, NULL, NULL, napi_default, NULL },
        { "insert", NULL, GridInsert, NULL, NULL, NULL, napi_default, NULL },
        { "bulkInsert", NULL, GridBulkInsert, NULL, NULL, NULL, napi_default, NULL },
        { "hasPlayerNear", NULL, GridHasPlayerNear, NULL, NULL, NULL, napi_default, NULL },
        { "queryRadius", NULL, GridQueryRadius, NULL, NULL, NULL, napi_default, NULL }
    };

    napi_value cons;
    napi_define_class(env, "NativeSpatialGrid", NAPI_AUTO_LENGTH, GridConstructor, NULL,
                      5, gridMethods, &cons);

    napi_create_reference(env, cons, 1, &constructor_ref);
    napi_set_named_property(env, exports, "NativeSpatialGrid", cons);

    napi_property_descriptor globalDesc[] = {
        { "fastDistance2", NULL, FastDistance2, NULL, NULL, NULL, napi_default, NULL },
        { "physicalDamage", NULL, CombatPhysicalDamage, NULL, NULL, NULL, napi_default, NULL },
        { "circuitDamage", NULL, CombatCircuitDamage, NULL, NULL, NULL, napi_default, NULL },
        { "hitChance", NULL, CombatHitChance, NULL, NULL, NULL, napi_default, NULL },
        { "blockChance", NULL, CombatBlockChance, NULL, NULL, NULL, napi_default, NULL },
        { "critChancePct", NULL, CombatCritChancePct, NULL, NULL, NULL, napi_default, NULL },
        { "statBonus", NULL, CombatStatBonus, NULL, NULL, NULL, napi_default, NULL },
        { "levelMod", NULL, CombatLevelMod, NULL, NULL, NULL, napi_default, NULL },
        { "resolveBatchAttacks", NULL, CombatResolveBatchAttacks, NULL, NULL, NULL, napi_default, NULL }
    };
    napi_define_properties(env, exports, sizeof(globalDesc) / sizeof(globalDesc[0]), globalDesc);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
