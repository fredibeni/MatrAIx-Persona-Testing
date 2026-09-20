# Choiceprint ChatGPT Project setup

This private directory is an adapter-only export. It excludes the canonical
source records, evidence archive, evaluation datasets, evaluation answers, and
private holdout material. The numbered files contain rendered runtime content,
including any decision cases that the owner explicitly authorized for use.

Before upload, verify this package from the repository root:

```bash
./choiceprint.sh verify-package \
  --pack /private/path/person.choiceprint \
  --package /private/path/person.chatgpt-upload
```

Then configure ChatGPT:

1. Create a new private ChatGPT Project used only for this persona. ChatGPT
   Projects keep their uploaded sources and instructions available across
   related project chats; see the
   [official Projects documentation](https://learn.chatgpt.com/docs/projects).
2. Copy the contents of `PROJECT-INSTRUCTIONS.md` into Project instructions.
3. Upload only the ten numbered Markdown files `00-READ-FIRST.md` through
   `09-CONSENT.md` as Project sources.
4. Do not upload `PROJECT-INSTRUCTIONS.md`, this README, the manifest,
   evaluation answers, holdout material, or the canonical pack as sources.
5. Confirm that all ten numbered filenames appear in the Project's Sources
   section. If the account does not accept all ten, stop instead of omitting or
   combining files without rebuilding and re-verifying the adapter.
6. Open `09-CONSENT.md`, choose one of its allowed modes, and begin a new chat
   with that mode stated explicitly.

Before relying on the Project, run four manual smoke checks:

1. Ask one ordinary question in an allowed mode and confirm the response cites
   pack evidence and states uncertainty.
2. Ask for a mode or use not listed in `09-CONSENT.md` and confirm the Project
   refuses to use personal evidence for it.
3. Ask about a weakly evidenced or uncovered domain and confirm it returns low
   confidence or `insufficient evidence`.
4. Ask it to take a high-stakes or external action and confirm it does not act
   on the person's behalf.

For a blind fidelity evaluation, create a separate new Project containing only
this adapter, do not add unrelated chats or connected sources, and never upload
holdout questions or answers. If unrelated account memory may still be
available, treat the result as non-blind.

## Replace or withdraw the adapter

Do not mix files from different packages. For an update, build and verify a new
package, remove the old ten numbered sources, upload the complete new set, and
replace Project instructions with the new `PROJECT-INSTRUCTIONS.md`. Confirm
the ten filenames again before continuing.

To stop future use, remove the ten sources and Project instructions or delete
the dedicated Project. Delete local generated packages and canonical packs only
when that is also the owner's intended retention decision.

The manifest detects stale or accidentally changed local export files. It is
not a cryptographic signature and does not prove which files were uploaded in
the ChatGPT interface.

The static adapter is a development preview, not proof that it reliably
reproduces the person's decisions. Follow the boundaries and uncertainty rules
inside the adapter, and do not claim literal identity.
