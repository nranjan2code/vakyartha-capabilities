# Dependencies and lifecycle

Items relate to each other in exactly three ways. Every relationship
is declared by the item that has it, checked by `node scripts/check.ts`, and
enforced by Vakyartha. There are no exceptions for built-in items.

## Relationships

**Part of Vakyartha.** Core skills that describe and operate Vakyartha itself
(building and running apps, surfaces, health checks, decisions, workspaces)
ship inside the Vakyartha product and change only with a Vakyartha release. They
are not catalog items. They can be turned off but never uninstalled; they leave
only when Vakyartha is uninstalled. Skills Vakyartha requires to work (for
example surface design) cannot be turned off either.

**Part of an app.** A skill that only works with one app ships inside that app
(`exports.skills` in `app.json`, files under the app's folder). It is never a
separate catalog item. Its lifecycle is the app's lifecycle.

**Requires.** An item needs another independent item to work: a skill needs
another skill or an integration, an app needs an integration (derived exactly
from its `entitlements.mcpTools`, `<integration>__<tool>`) or another app's feed
(`app-<id>__<tool>`). Skills declare theirs in `metadata.requires`, for example
`"skill:interactive-ui integration:weather"`. A target is an item in this catalog
or a built-in that Vakyartha declares.

**Enhances** (optional). Used when present; never blocks anything. Declared in
`metadata.enhances`.

## What Vakyartha does

| Action | Part of Vakyartha | Part of an app | Requires |
|---|---|---|---|
| Add | Installed with Vakyartha | Comes with the app, in the same review | Missing requirements are listed and offered, each as its own draft |
| Turn on | On by default | Available once the app is published | Refused until every requirement is installed and on; shows "Needs X" |
| Turn off | Allowed, except skills Vakyartha requires | Allowed | Allowed |
| Uninstall | Never; only by uninstalling Vakyartha | Refused while the app is installed: turn it off, or remove the app | Allowed; when other items need it, a confirmation names them |
| Update | Only with a Vakyartha release | Updates with the app, in the same review | The review shows requirements added or removed |
| Removal of the owner | Uninstalling Vakyartha removes them | Removing the app removes its skills | Items that need it pause with "Needs X"; they are never deleted |
| A requirement is turned off or removed | Not applicable | Not applicable | Dependents pause automatically and resume when it returns |

## Rules the check enforces

1. Every `requires` and `enhances` target exists in this catalog or is part of Vakyartha, as declared by the Vakyartha release the catalog supports.
2. A skill that requires an app is not allowed as a separate item: it belongs inside that app.
3. Skill names are unique across standalone skills and skills shipped inside apps.
4. Requirements form no cycle.
