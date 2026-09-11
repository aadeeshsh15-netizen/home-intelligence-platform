# Production Release Checklist

Use this executable checklist prior to deploying any production release of the **Home Intelligence Platform**. Every step must pass before production promotion.

---

## 1. Codebase & Integrity Verification

- [ ] **1. Git Working Tree Cleanliness**
  ```bash
  git status
  # Must output: "nothing to commit, working tree clean"
  ```

- [ ] **2. Author Attribution Verification**
  ```bash
  git log -n 5 --pretty=fuller
  # Verify Author and Committer are: Aadeesh Sharma <aadeeshsh15@gmail.com>
  ```

- [ ] **3. Environment Variable Audit**
  ```bash
  # Ensure no production secrets exist in .env.example or repository
  git grep -i "super-secret" .env.example
  ```

---

## 2. Automated Quality & Static Analysis

- [ ] **4. TypeScript Static Type Check**
  ```bash
  npx tsc --noEmit
  # Must exit with code 0 and 0 errors across app and tests
  ```

- [ ] **5. ESLint Code Quality Check**
  ```bash
  npm run lint
  # Must exit with 0 errors
  ```

- [ ] **6. Complete Automated Test Suite (35+ suites, 160+ tests)**
  ```bash
  npm test -- --fileParallelism=false
  # Must pass 100% of unit, integration, benchmark, and E2E suites
  ```

---

## 3. Build & Container Validation

- [ ] **7. Next.js Production Build**
  ```bash
  npm run build
  # Verify all 22+ static/dynamic pages and 35+ API routes compile with 0 errors
  ```

- [ ] **8. Docker Compose Production Configuration**
  ```bash
  docker compose -f docker-compose.prod.yml config
  # Must exit with code 0 and no validation warnings
  ```

- [ ] **9. Container Build Validation**
  ```bash
  docker build -t home-intelligence-platform:release-candidate .
  # Must build multi-stage image cleanly
  ```

---

## 4. Database & Operational Readiness

- [ ] **10. Migration Verification**
  ```bash
  # Check if pending migrations exist and apply cleanly
  npx prisma migrate status
  npm run db:migrate
  ```

- [ ] **11. System Probe Endpoints**
  ```bash
  # Verify Liveness probe returns 200 OK
  curl -s -f http://localhost:3000/api/live || exit 1

  # Verify Readiness probe returns 200 OK
  curl -s -f http://localhost:3000/api/ready || exit 1

  # Verify Health diagnostics report HEALTHY or DEGRADED (not CRITICAL)
  curl -s http://localhost:3000/api/health | jq .status
  ```

- [ ] **12. Rate Limiting Protection**
  ```bash
  # Test auth login rate limiter after 11 attempts
  for i in {1..11}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{}'; done
  # 11th request must return 429 Too Many Requests
  ```

- [ ] **13. Sensitive Credential Redaction Check**
  ```bash
  # Trigger an event and verify log output does not contain raw passwords or tokens
  # Must display '[REDACTED]' for all sensitive fields
  ```

- [ ] **14. Presentation & Demo Console Verification**
  ```bash
  npm run demo
  # Verify demo runner loads all 6 scenarios in IDLE state
  ```

---

## 5. Rollback Plan

If unrecoverable faults occur post-deployment:
1. Revert container image tag to previous stable release:
   ```bash
   docker compose -f docker-compose.prod.yml down
   # Point docker-compose.prod.yml to previous image tag
   docker compose -f docker-compose.prod.yml up -d
   ```
2. If database schema was altered, restore from pre-deployment snapshot:
   ```bash
   cat backups/pre_release_snapshot.dump | \
     docker exec -i home_intelligence_prod_db pg_restore -U postgres -d home_intelligence --clean --if-exists
   ```
3. Re-verify `/api/ready` returns `200 OK`.
