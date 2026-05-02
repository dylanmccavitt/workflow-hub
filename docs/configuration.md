# Project Configuration

Workflow Hub reads the tracked example registry from `config/projects.example.json` and then applies optional local overrides from ignored `config/projects.json`.

`config/projects.json` is for machine-specific paths and local preferences only. Do not put direct secret values, tokens, Firebase plist contents, Linear state, PR state, or workflow scratchpad data in it. Store secret values in ignored environment files, the launching shell, or OS/CLI credential storage; project config may name environment variables such as `CURSOR_API_KEY`.

## Schema

The tracked schema is `config/projects.schema.json`.

Top-level fields:

- `schemaVersion`: currently `1`.
- `projects`: local project registry entries.

Project fields:

- `id`: stable local project id.
- `displayName`: human-readable project name.
- `linear`: optional Linear routing hints such as `teamKey`, `projectId`, or `projectSlug`.
- `repo.canonicalPath`: path to the canonical checkout for the repo.
- `repo.canonicalBranch`: canonical branch, usually `main`.
- `worktrees.roots`: directories that contain issue worktrees for the project.
- `worktrees.issuePathTemplate`: issue workspace naming template. The default is `{issueId}`.
- `worktrees.branchTemplate`: branch naming template for new issue work.
- `ios`: optional iOS review settings.

For live Linear project issue sync, set `linear.projectId`. `projectSlug` is a readable hint and URL aid, but the read-only sync queries Linear by project id.

When `ios` is present, it must include:

- `projectPath` or `workspacePath`: Xcode project/workspace path relative to the issue worktree.
- `scheme`: Xcode scheme.
- `bundleId`: app bundle identifier.

Optional iOS fields:

- `simulatorName`: simulator destination name. Defaults to `iPhone 17 Pro`.
- `derivedDataRoot`: root for isolated DerivedData. Defaults to `/tmp`.

## Local Overrides

Create a local override by copying the example:

```sh
cp config/projects.example.json config/projects.json
```

The loader merges projects by `id`. A local file may override only the values that differ on the current machine:

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "id": "workflow-hub",
      "repo": {
        "canonicalPath": "~/projects/workflow-hub"
      },
      "worktrees": {
        "roots": ["~/.codex/symphony-workspaces/workflow-hub"]
      }
    }
  ]
}
```

Arrays replace the tracked example values. Nested objects merge by key.

## Canonical Checkout And Issue Worktrees

`repo.canonicalPath` is the durable main checkout. It is used for project-level docs, mainline sync, and post-merge fast-forwards.

`worktrees.roots` are issue workspace roots. Each issue should resolve to exactly one worktree under one of these roots. With the default template, `AGE-347` resolves to:

```text
<worktree-root>/AGE-347
```

The config helps Workflow Hub find local paths. It does not make the config a source of truth for issue state, branch state, PR state, or review state. Those stay in Linear, git, PR providers, repo docs, and code.

## Workspace Resolution Commands

The CLI resolves issue workspaces from the configured `worktrees.roots`.

```sh
npm run workflow -- status AGE-350
npm run workflow -- open AGE-350 --zed
npm run workflow -- open AGE-350 --xcode
npm run workflow -- open AGE-350 --finder
npm run workflow -- open AGE-350 --terminal
```

When the command is run from inside a configured issue worktree, `status` and `open` may omit the issue ID:

```sh
npm run workflow -- status
npm run workflow -- open --zed
```

Status output shows the canonical repo and the issue workspace separately, including branch, head SHA, and dirty/clean git state. The resolver does not treat the canonical checkout as an issue workspace.
