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

**Enhances** (optional). Used when present; never blocks anything. Skills declare
it in `metadata.enhances`. For an app it is derived: an owner whose every declared
tool is marked `"optional": true` in `entitlements.toolPurposes` enhances the app
instead of being required by it.

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

## Signed releases

Every catalog release is signed. The signed object is the exact bytes of
`index.json`, which lists every archive with its SHA-256; the signature
(`index.json.sig`, Ed25519, lowercase hex) therefore covers every item in the release.

- The private key is held only by the owner, in the macOS Keychain on the
  owner's computer. `node scripts/sign.ts` signs a built release after the owner
  confirms the version at the terminal. CI never holds the key; it verifies the
  signature and refuses to publish an unsigned or mis-signed release.
- The public key is `keys/catalog.pub` in this repository. Vakyartha compiles in
  the key from the release it pins and accepts nothing that does not verify.
- Vakyartha's bundled items come from the pinned release and are verified
  against the same signature when Vakyartha is built.

## Changing what Vakyartha ships

People may change any shipped item: core skills, app skills, apps and
integrations. Vakyartha keeps the exact signed original beside the change.

| Situation | What Vakyartha does |
|---|---|
| An item is changed in Vakyartha | It is marked **Changed by you**, is never shown as verified and is never re-signed |
| Reset | **Reset to Vakyartha version** restores the exact signed bytes of the installed release and verifies them again |
| A new signed version arrives for a changed item | The review shows the change beside the new version; the person keeps theirs or resets and updates. Nothing is overwritten silently |
| Files change on disk outside Vakyartha | The item fails its integrity check, is marked, and reset is offered |

## Integrations follow Vakyartha's release

An integration reaches the network, so the hosts it may reach and the key each
host receives are compiled into Vakyartha from the release it pins. Vakyartha
offers the integrations compiled into it. A newer catalog release may list an
integration this Vakyartha does not have; it is shown as needing a Vakyartha
update and cannot be added until then.
