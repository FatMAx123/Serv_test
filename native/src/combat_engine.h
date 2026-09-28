#ifndef COMBAT_ENGINE_H
#define COMBAT_ENGINE_H

#include <cstdint>
#include <cmath>
#include <algorithm>

namespace project_steam {

// Canonical Lineage 2 C1 Combat Constants
static constexpr float PHYS_NORM = 70.0f;
static constexpr float CIRCUIT_NORM = 91.0f;
static constexpr float PHYS_RAND_MIN = 0.85f;
static constexpr float PHYS_RAND_MAX = 1.15f;
static constexpr float CIRCUIT_RAND_MIN = 0.90f;
static constexpr float CIRCUIT_RAND_MAX = 1.10f;
static constexpr float BASE_CRIT_MULT = 2.0f;
static constexpr float MAGIC_CRIT_MULT = 3.0f;
static constexpr float MAGIC_CRIT_PCT = 2.0f;
static constexpr float HIT_BASE = 75.0f;
static constexpr float HIT_PER_DIFF = 5.0f;
static constexpr float HIT_MIN = 5.0f;
static constexpr float HIT_MAX = 98.0f;
static constexpr float BASE_CRIT_PCT = 40.0f;
static constexpr float SHIELD_BASE_BLOCK = 20.0f;
static constexpr float BLOCK_CAP = 70.0f;
static constexpr float SOULSHOT_MULT = 2.0f;
static constexpr float SPIRITSHOT_MULT = 1.5f;
static constexpr float BLESSED_SPIRITSHOT_MULT = 2.0f;
static constexpr float ABSOLUTE_POWER_MIN = 6.0f;
static constexpr float CIRCUIT_REL_POWER_REF = 16.0f;
static constexpr float DEX_ATK_SPD_REF = 8.826f;

// Fast xorshift64star PRNG
class FastRng {
private:
    uint64_t state;
public:
    inline FastRng(uint64_t seed = 88172645463325252ULL) : state(seed) {}

    inline uint64_t next() {
        uint64_t x = state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        state = x;
        return x * 0x2545F4914F6CDD1DULL;
    }

    inline float nextFloat() {
        return (next() >> 40) * (1.0f / 16777216.0f);
    }

    inline float range(float minVal, float maxVal) {
        return minVal + nextFloat() * (maxVal - minVal);
    }
};

class NativeCombatEngine {
public:
    static inline float clamp(float v, float a, float b) {
        return std::max(a, std::min(b, v));
    }

    static inline float statBonus(float value, int statType) {
        // statType: 0=STR, 1=INT, 2=DEX, 3=WIT, 4=CON, 5=MEN
        float base = 1.0f;
        float ref = 0.0f;
        switch (statType) {
            case 0: base = 1.036f; ref = 34.845f; break; // STR
            case 1: base = 1.020f; ref = 31.375f; break; // INT
            case 2: base = 1.009f; ref = 19.360f; break; // DEX
            case 3: base = 1.050f; ref = 20.000f; break; // WIT
            case 4: base = 1.030f; ref = 27.632f; break; // CON
            case 5: base = 1.010f; ref = -0.060f; break; // MEN
            default: return 1.0f;
        }
        float raw = std::pow(base, value - ref);
        return std::floor(raw * 100.0f + 0.5f) / 100.0f;
    }

    static inline float levelMod(float level) {
        return (std::max(1.0f, level) + 89.0f) / 100.0f;
    }

    static inline float hitChance(float accuracy, float evasion) {
        float chance = HIT_BASE + (accuracy - evasion) * HIT_PER_DIFF;
        return clamp(chance, HIT_MIN, HIT_MAX);
    }

    static inline float dexModAtkSpd(float dex) {
        return std::pow(1.009f, std::max(1.0f, dex) - DEX_ATK_SPD_REF);
    }

    static inline float critChancePct(float dex, float bonusPct = 0.0f, int weaponType = 0) {
        // weaponType: 0=fist/blunt, 1=sword/dual/pole, 2=dagger/bow
        float wBase = BASE_CRIT_PCT;
        if (weaponType == 2) wBase = 120.0f;
        else if (weaponType == 1) wBase = 80.0f;

        float mod = (wBase == 40.0f && dex <= 21.0f) ? 1.0f : dexModAtkSpd(dex);
        float critL2 = std::floor(wBase * mod + bonusPct);
        return clamp(critL2, 10.0f, 500.0f);
    }

    static inline float blockChance(float shieldDef, float pDef, float bonusPct = 0.0f) {
        if (shieldDef <= 0.0f && bonusPct <= 0.0f) return 0.0f;
        float base = SHIELD_BASE_BLOCK;
        if (shieldDef > 0.0f && (pDef + shieldDef) > 0.0f) {
            base += (shieldDef / (pDef + shieldDef)) * 30.0f;
        }
        return clamp(base + bonusPct, 0.0f, BLOCK_CAP);
    }

    static inline int32_t physicalDamage(float pAtk, float pDef, float skillPower = 1.0f,
                                         float shotMod = 1.0f, float randFactor = 1.0f) {
        if (pAtk < 1.0f) pAtk = 1.0f;
        if (pDef < 1.0f) pDef = 1.0f;
        if (shotMod <= 0.0f) shotMod = 1.0f;

        float dmg = 0.0f;
        if (skillPower >= ABSOLUTE_POWER_MIN) {
            float atk = pAtk * shotMod;
            float power = skillPower * shotMod;
            dmg = PHYS_NORM * (atk + power) / pDef * randFactor;
        } else {
            dmg = PHYS_NORM * pAtk * skillPower * shotMod / pDef * randFactor;
        }
        return std::max(1, static_cast<int32_t>(std::floor(dmg)));
    }

    static inline int32_t circuitDamage(float cAtk, float cDef, float skillPower = 1.0f,
                                        float shotMod = 1.0f, float elementMod = 1.0f,
                                        float randFactor = 1.0f) {
        if (cAtk < 1.0f) cAtk = 1.0f;
        if (cDef < 1.0f) cDef = 1.0f;
        if (shotMod <= 0.0f) shotMod = 1.0f;
        if (elementMod <= 0.0f) elementMod = 1.0f;

        float power = (skillPower >= ABSOLUTE_POWER_MIN)
            ? skillPower
            : skillPower * CIRCUIT_REL_POWER_REF;
        if (power <= 0.0f) power = CIRCUIT_REL_POWER_REF;

        float dmg = CIRCUIT_NORM * power * std::sqrt(cAtk) / cDef
            * shotMod * elementMod * randFactor;
        return std::max(1, static_cast<int32_t>(std::floor(dmg)));
    }

    /**
     * Пакетный расчет N атак за один вызов C++ SIMD:
     * input: [type, aAtk, dDef, acc, eva, skillPower, shotMod, critChance, critMult, shieldDef, blockBonus, ignoreDef] (12 floats per attack)
     * output: [damage, missed, crit, blocked] (4 int32 per attack)
     */
    static void resolveBatchAttacks(const float* input, int32_t* output, int32_t count, FastRng& rng) {
        for (int32_t i = 0; i < count; i++) {
            const float* in = input + (i * 12);
            int32_t* out = output + (i * 4);

            int32_t dtype = static_cast<int32_t>(in[0]); // 0=phys, 1=circuit
            float aAtk = in[1];
            float dDef = in[2];
            float acc = in[3];
            float eva = in[4];
            float skillPower = in[5] > 0.0f ? in[5] : 1.0f;
            float shotMod = in[6] > 0.0f ? in[6] : 1.0f;
            float critChance = in[7];
            float critMult = in[8] > 0.0f ? in[8] : (dtype == 1 ? MAGIC_CRIT_MULT : BASE_CRIT_MULT);
            float shieldDef = in[9];
            float blockBonus = in[10];
            float ignoreDef = clamp(in[11], 0.0f, 0.95f);

            // 1. Hit check (for physical attacks)
            if (dtype == 0) {
                float hChance = hitChance(acc, eva);
                if (rng.nextFloat() * 100.0f >= hChance) {
                    out[0] = 0; // dmg
                    out[1] = 1; // missed
                    out[2] = 0; // crit
                    out[3] = 0; // blocked
                    continue;
                }
            }

            // 2. Shield Block check (for physical attacks)
            bool blocked = false;
            float effectiveDef = dDef * (1.0f - ignoreDef);
            if (dtype == 0 && shieldDef > 0.0f) {
                float bChance = blockChance(shieldDef, dDef, blockBonus);
                if (rng.nextFloat() * 100.0f < bChance) {
                    blocked = true;
                    effectiveDef = (dDef + shieldDef) * (1.0f - ignoreDef);
                }
            }
            if (effectiveDef < 1.0f) effectiveDef = 1.0f;

            // 3. Base Damage calculation
            int32_t dmg = 0;
            if (dtype == 1) {
                float rFactor = rng.range(CIRCUIT_RAND_MIN, CIRCUIT_RAND_MAX);
                dmg = circuitDamage(aAtk, effectiveDef, skillPower, shotMod, 1.0f, rFactor);
            } else {
                float rFactor = rng.range(PHYS_RAND_MIN, PHYS_RAND_MAX);
                dmg = physicalDamage(aAtk, effectiveDef, skillPower, shotMod, rFactor);
            }

            // 4. Critical hit check
            bool isCrit = false;
            float critPct = critChance;
            if (critPct <= 0.0f) {
                critPct = (dtype == 1) ? MAGIC_CRIT_PCT : 15.0f;
            }
            // If scale > 1 (e.g. 44 in L2 scale), 44 = 4.4%
            float actualCritPct = (critPct > 1.0f) ? (critPct / 10.0f) : (critPct * 100.0f);
            if (rng.nextFloat() * 100.0f < actualCritPct) {
                isCrit = true;
                dmg = static_cast<int32_t>(std::floor(dmg * critMult));
            }

            out[0] = std::max(1, dmg);
            out[1] = 0; // not missed
            out[2] = isCrit ? 1 : 0;
            out[3] = blocked ? 1 : 0;
        }
    }
};

} // namespace project_steam

#endif // COMBAT_ENGINE_H
