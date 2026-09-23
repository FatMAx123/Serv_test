# Project Steam: Origins -- MMO Cluster Stepped Stress Testing Suite

Distributed load testing and performance benchmark suite for Project Steam MMO cluster, powered by GitHub Actions.

## Capabilities
- Stepped loads: 1,000 -> 2,000 -> 3,000 -> 4,000 -> 5,000 CCU.
- 100% unique player profiles (no duplicates, unique races, classes, gear, and names).
- City life on the main town square (patrolling, sitting, chatting).
- Dynamic hunting behavior across 340 spawn locations.
- Zero-copy binary protocol (NPB) with 10 Hz Dead Reckoning.
- Full telemetry: RTT percentiles (p50, p95), server tick times, memory usage, traffic metrics.

## Running Benchmarks
Open the **Actions** tab on GitHub, select **MMO Cluster Stepped Stress Test**, and click **Run workflow**.
