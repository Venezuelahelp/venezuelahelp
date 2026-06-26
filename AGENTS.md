# AGENTS.md — VenezuelaHelp

Ver `CLAUDE.md` para el contexto completo. Notas para agentes:

## Deploy (CDK) <!-- /aprende 2026-06-26 -->

- El SDK de Node de CDK no resuelve bien las credenciales SSO del perfil `VenezuelaHelp`; **exportarlas** antes de desplegar:
  ```bash
  cd infra
  eval "$(aws configure export-credentials --profile VenezuelaHelp --format env)"
  CDK_DEFAULT_ACCOUNT=720115910277 CDK_DEFAULT_REGION=us-east-1 npx cdk deploy <Stack> --require-approval never
  ```
- **Construir cada frontend antes del `cdk synth`/`deploy`** (el `BucketDeployment` usa `Source.asset(.../dist)`): `npm run build --workspace @venezuelahelp/frontend-public` (y `frontend-admin`).
- Cuenta AWS `720115910277`, región `us-east-1`. Stacks (todos con prefijo `VenezuelaHelp`): `VenezuelaHelpDataStack`, `VenezuelaHelpScraperStack`, `VenezuelaHelpBotStack`, `VenezuelaHelpFrontendStack`, `VenezuelaHelpAdminStack`. Usa el nombre completo en `cdk deploy` — `cdk deploy BotStack` falla con "No stacks match the name(s)". <!-- /aprende 2026-06-26 -->
