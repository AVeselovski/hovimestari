<!-- Memory index for architect. One line per memory file: - [Title](file.md): one-line hook. Never write memory content here. -->

- [No literal secrets](project_no_literal_secrets.md): GitGuardian fails PRs on any literal password; trust auth and generated test secrets
- [Finanssi lift gaps](project_finanssi_lift_gaps.md): finanssi's session leaks the refresh token to JS; check lifts against NFRs
- [Fineli access](reference_fineli_access.md): fineli.fi is Cloudflare-blocked for agents; what sources work instead
- [Cascade walk and shared rows](project_cascade_walk_shared_rows.md): foods is reached from users, so keys into it must cascade; retire, never delete
- [Measure claims on real data](feedback_measure_claims_on_real_data.md): run ranking/parse rules on real rows before claiming results; literal FR wording wins
- [Refresh-token families](project_refresh_token_families.md): siblings not replacement, fam claim for reuse, user-row lock before any token write
- [Entry figures model](project_entry_figures_model.md): basis written once at add, sum of rounded rows, fixed gauge scale, stale today on resume
