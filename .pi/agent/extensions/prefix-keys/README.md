# prefix-keys extension notes

File: `~/.pi/agent/extensions/prefix-keys.ts`

These are implementation notes and gotchas to make future edits safer.

## How this extension works
- It installs a custom editor (`PrefixEditor`) via `ctx.ui.setEditorComponent(...)` on `session_start`.
- The custom editor intercepts the prefix key first (currently from config, default `ctrl+x`).
- After prefix is pressed, it shows an overlay and waits for the second key.
- Bound actions are dispatched either as:
  - **editor-level** raw sequences (`yank`, `yankPop`, `undo`), or
  - **app-level** actions (model selector, external editor, session operations, etc.).

## Important gotchas

### 1) Built-in interactive commands are not normal slash commands
- Sending `pi.sendUserMessage("/models")` does **not** reliably invoke built-in interactive UI commands.
- It is treated as user text and can end up going to the model.
- For model selector, use app action handler directly in the custom editor:
  - `this.actionHandlers.get("app.model.select")?.()`

### 2) Action handler keys must use full app keybinding names
Use keys from pi keybindings (not shorthand names), e.g.:
- `app.model.select` (model picker)
- `app.editor.external` (external editor)

Shorthand names like `"externalEditor"` are not guaranteed in `actionHandlers`.

### 3) Config behavior
Config files:
- Global: `~/.pi/agent/prefix-keys.json`
- Project local: `.pi/prefix-keys.json`

Merge behavior:
- Global can set `prefix`, `timeout`, `bindings`.
- Project local can override `timeout` + `bindings`.
- Project local **cannot** override `prefix` (by design).

### 4) Prefix key changes require restart
- Prefix is loaded at extension startup for editor interception.
- If config prefix differs later, extension warns; restart pi to apply prefix-key changes.

### 5) Session/new/fork actions
- `newSession`/`fork` are bridged through extension commands because those APIs require `ExtensionCommandContext`.
- Current bridge commands:
  - `/prefix-keys-new`
  - `/prefix-keys-fork`

## Editing checklist
When changing actions/bindings:
1. Update `ActionType` union if adding new action kinds.
2. Update `DEFAULT_CONFIG.bindings` descriptions.
3. Update runtime config (`~/.pi/agent/prefix-keys.json`) if desired.
4. Ensure app-level actions use correct `actionHandlers` key names.
5. `/reload` and manually test:
   - prefix opens overlay
   - cancel behavior (esc/unbound key)
   - `m` opens model selector
   - `e` opens external editor
   - `p`/`undo` editor actions still work

## Quick reference
- Extension file: `~/.pi/agent/extensions/prefix-keys.ts`
- Global config: `~/.pi/agent/prefix-keys.json`
- Reload extension: `/reload`
