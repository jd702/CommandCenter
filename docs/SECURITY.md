# Security and Public Repository Guidance

## Never commit

- API keys, access tokens, passwords, SSH keys, certificates, or cookies
- Private robot, laboratory, VPN, or internal service addresses
- `.env`, `.env.local`, runtime secrets, or credential files
- recorded media containing sensitive locations or identifying information without review
- model caches, virtual environments, build output, archives, or exported container images

## Configuration

Copy `.env.example` to `.env.local` and replace placeholders locally. React variables beginning with `REACT_APP_` are visible to every browser user, so they are configuration only and cannot safely hold secrets.

## Authentication

`REACT_APP_AUTH_MODE=disabled` is intended for trusted local development. `demo` mode is also client-side and is not secure production authentication. Production deployments must enforce authentication and authorization through a trusted server or identity provider.

## Robot safety

- Validate E-stop independently before enabling remote control.
- Restrict the robot API to trusted networks and authenticated clients.
- Use dry-run or simulation when testing new task, voice, or gesture mappings.
- Do not rely on the browser UI as the only safety layer.

## Before every push

1. Review `git diff --cached`.
2. Search staged content for tokens, credentials, and non-placeholder IP addresses.
3. Confirm large media and generated files are ignored.
4. Rotate any secret that was ever committed; deleting it in a later commit is not sufficient.
