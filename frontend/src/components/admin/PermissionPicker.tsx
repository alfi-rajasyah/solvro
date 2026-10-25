import { PERMISSION_CATALOG } from "@/lib/auth";

// Tick-box editor over the curated PERMISSION_CATALOG. "*" (Full access)
// supersedes the rest: when it's on, the specific permissions show as
// implied + disabled; ticking a specific one drops the wildcard.
//
// A value on the role that the catalogue no longer lists (a permission since
// removed from the app) gets its own ticked row, so it is visible and can be
// unticked — the server rejects unknown permissions on save, so a role that
// still holds one could otherwise never be saved.
export function PermissionPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const all = value.includes("*");
  const known = new Set(PERMISSION_CATALOG.map((p) => p.value));
  const unknown = value.filter((p) => !known.has(p));
  function toggle(perm: string) {
    if (perm === "*") {
      onChange(all ? [] : ["*"]);
      return;
    }
    if (all) {
      onChange([perm]); // selecting a specific permission drops the wildcard
      return;
    }
    onChange(
      value.includes(perm)
        ? value.filter((p) => p !== perm)
        : [...value, perm],
    );
  }
  return (
    <ul className="divide-y divide-outline-variant/60 rounded-sm border border-outline-variant bg-surface">
      {PERMISSION_CATALOG.map((perm) => {
        const isWildcard = perm.value === "*";
        const checked = isWildcard ? all : all || value.includes(perm.value);
        const disabled = all && !isWildcard;
        return (
          <li key={perm.value}>
            <label
              title={perm.hint}
              className={`flex items-center gap-2.5 px-3 py-1.5 text-[13px] ${
                disabled ? "opacity-50" : "cursor-pointer hover:bg-surface-container-low"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(perm.value)}
                className="accent-primary"
              />
              <span className="font-mono text-on-surface">{perm.value}</span>
              <span className="text-on-surface-variant">— {perm.label}</span>
            </label>
          </li>
        );
      })}
      {unknown.map((perm) => (
        <li key={`unknown:${perm}`}>
          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-surface-container-low">
            <input
              type="checkbox"
              checked
              onChange={() => onChange(value.filter((p) => p !== perm))}
              className="accent-primary"
            />
            <span className="font-mono text-on-surface">{perm}</span>
            <span className="text-error">— no longer in the catalogue</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
