import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { adminApi } from '../api/endpoints';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Tabs,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { validateBands } from '../lib/approvalBands';
import { errorMessage } from '../lib/errors';
import { toast } from '../stores/uiStore';

const TABS = [
  { value: 'config', label: 'Approval config' },
  { value: 'roles', label: 'Roles' },
];

export default function AdminPage() {
  const [tab, setTab] = useState('config');

  const permissionsAsync = useAsync(() => adminApi.permissions(), []);
  const rolesAsync = useAsync(() => adminApi.roles(), []);
  const configAsync = useAsync(() => adminApi.getConfig(), []);

  const [bands, setBands] = useState(null);
  const [configErrors, setConfigErrors] = useState([]);
  const [configSaveError, setConfigSaveError] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const [roleDraft, setRoleDraft] = useState(null);
  const [roleError, setRoleError] = useState('');
  const [savingRole, setSavingRole] = useState(false);

  const permissions = permissionsAsync.data?.items ?? [];
  const roles = rolesAsync.data?.items ?? [];

  const rolesByKey = useMemo(
    () => new Map(roles.map((role) => [role.key, role])),
    [roles],
  );
  const approverKeys = useMemo(
    () =>
      new Set(
        roles
          .filter((role) =>
            (role.permissions ?? []).some(
              (permission) => permission.key === 'discount.approve',
            ),
          )
          .map((role) => role.key),
      ),
    [roles],
  );

  useEffect(() => {
    if (!configAsync.data) return;

    setBands(
      configAsync.data.items.map((band) => ({
        minPct: String(band.minPct),
        maxPct: String(band.maxPct),
        chain: [...band.chain],
      })),
    );
  }, [configAsync.data]);

  const loading =
    permissionsAsync.loading || rolesAsync.loading || configAsync.loading;
  const loadError =
    permissionsAsync.error || rolesAsync.error || configAsync.error;

  if (loading && !bands) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Spinner className="h-4 w-4 text-brand-500" />
        Loading admin data
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <AlertTriangle className="mx-auto h-7 w-7 text-rose-500" />
        <h1 className="mt-3 text-base font-semibold text-ink-900">
          Could not load admin data
        </h1>
        <p className="mt-1 text-sm text-slate-600">{errorMessage(loadError)}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => {
            permissionsAsync.refresh();
            rolesAsync.refresh();
            configAsync.refresh();
          }}
        >
          <RotateCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  function updateBand(index, patch) {
    setBands((current) =>
      current.map((band, bandIndex) =>
        bandIndex === index ? { ...band, ...patch } : band,
      ),
    );
  }

  function addBand() {
    setBands((current) => {
      const last = current[current.length - 1];
      return [
        ...current,
        {
          minPct: last ? last.maxPct : '0',
          maxPct: '100',
          chain: [],
        },
      ];
    });
  }

  function removeBand(index) {
    setBands((current) => current.filter((_, bandIndex) => bandIndex !== index));
  }

  function addChainRole(index, roleKey) {
    if (!roleKey) return;

    setBands((current) =>
      current.map((band, bandIndex) =>
        bandIndex === index && !band.chain.includes(roleKey)
          ? { ...band, chain: [...band.chain, roleKey] }
          : band,
      ),
    );
  }

  function removeChainRole(index, roleKey) {
    setBands((current) =>
      current.map((band, bandIndex) =>
        bandIndex === index
          ? { ...band, chain: band.chain.filter((key) => key !== roleKey) }
          : band,
      ),
    );
  }

  function moveChainRole(index, chainIndex, delta) {
    setBands((current) =>
      current.map((band, bandIndex) => {
        if (bandIndex !== index) return band;

        const target = chainIndex + delta;

        if (target < 0 || target >= band.chain.length) return band;

        const chain = [...band.chain];
        [chain[chainIndex], chain[target]] = [chain[target], chain[chainIndex]];
        return { ...band, chain };
      }),
    );
  }

  async function saveConfig() {
    const { errors, parsed } = validateBands(
      bands ?? [],
      rolesByKey,
      approverKeys,
    );

    setConfigErrors(errors);
    setConfigSaveError('');

    if (errors.length > 0) return;

    setSavingConfig(true);

    try {
      await adminApi.saveConfig(parsed);
      toast.success('Approval config saved. New requests use it.');
      configAsync.refresh();
    } catch (error) {
      setConfigSaveError(errorMessage(error));
    } finally {
      setSavingConfig(false);
    }
  }

  function startCreateRole() {
    setRoleError('');
    setRoleDraft({ id: null, key: '', name: '', permissions: {} });
  }

  function startEditRole(role) {
    setRoleError('');
    setRoleDraft({
      id: role._id,
      key: role.key,
      name: role.name ?? '',
      permissions: Object.fromEntries(
        (role.permissions ?? []).map((permission) => [
          permission.key,
          permission.scope,
        ]),
      ),
    });
  }

  function togglePermission(permission, enabled) {
    setRoleDraft((current) => {
      const next = { ...current.permissions };

      if (enabled) {
        next[permission.key] = permission.allowedScopes[0];
      } else {
        delete next[permission.key];
      }

      return { ...current, permissions: next };
    });
  }

  function setPermissionScope(permission, scope) {
    setRoleDraft((current) => ({
      ...current,
      permissions: { ...current.permissions, [permission.key]: scope },
    }));
  }

  async function saveRole() {
    if (!roleDraft) return;

    if (!roleDraft.key.trim()) {
      setRoleError('A role key is required.');
      return;
    }

    const payload = {
      key: roleDraft.key.trim(),
      name: roleDraft.name.trim() || undefined,
      permissions: permissions
        .filter((permission) => roleDraft.permissions[permission.key])
        .map((permission) => ({
          key: permission.key,
          scope: roleDraft.permissions[permission.key],
        })),
    };

    setRoleError('');
    setSavingRole(true);

    try {
      if (roleDraft.id) {
        await adminApi.updateRole(roleDraft.id, payload);
        toast.success('Role updated.');
      } else {
        await adminApi.createRole(payload);
        toast.success('Role created.');
      }

      setRoleDraft(null);
      rolesAsync.refresh();
      configAsync.refresh();
    } catch (error) {
      setRoleError(errorMessage(error));
    } finally {
      setSavingRole(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Administration"
        title="Admin"
        description="Approval bands drive new discount requests; roles define what each user can do."
        actions={
          tab === 'roles' && (
            <Button size="sm" onClick={startCreateRole}>
              <Plus className="h-4 w-4" />
              New role
            </Button>
          )
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} label="Admin sections" />

      {tab === 'config' && bands && (
        <section className="space-y-3">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Applies to new requests only. Existing requests keep their
              snapshotted chain and history.
            </div>

            <div className="mt-3 space-y-2">
              {bands.map((band, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg bg-canvas p-3 sm:grid-cols-[5.5rem_5.5rem_1fr_2rem]"
                >
                  <Field label="Min %" htmlFor={`band-min-${index}`}>
                    <Input
                      id={`band-min-${index}`}
                      type="number"
                      min="0"
                      max="100"
                      value={band.minPct}
                      onChange={(event) =>
                        updateBand(index, { minPct: event.target.value })
                      }
                      disabled={savingConfig}
                    />
                  </Field>

                  <Field label="Max %" htmlFor={`band-max-${index}`}>
                    <Input
                      id={`band-max-${index}`}
                      type="number"
                      min="0"
                      max="100"
                      value={band.maxPct}
                      onChange={(event) =>
                        updateBand(index, { maxPct: event.target.value })
                      }
                      disabled={savingConfig}
                    />
                  </Field>

                  <div>
                    <span className="block text-xs font-medium text-slate-600">
                      Chain (in order)
                    </span>
                    <div className="mt-1.5 flex min-h-10 flex-wrap items-center gap-1.5">
                      {band.chain.map((roleKey, chainIndex) => (
                        <span
                          key={roleKey}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200"
                        >
                          {chainIndex + 1}. {roleKey}
                          <button
                            type="button"
                            onClick={() => moveChainRole(index, chainIndex, -1)}
                            aria-label={`Move ${roleKey} earlier`}
                            className="text-slate-400 hover:text-brand-600 disabled:opacity-30"
                            disabled={savingConfig || chainIndex === 0}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveChainRole(index, chainIndex, 1)}
                            aria-label={`Move ${roleKey} later`}
                            className="text-slate-400 hover:text-brand-600 disabled:opacity-30"
                            disabled={
                              savingConfig ||
                              chainIndex === band.chain.length - 1
                            }
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeChainRole(index, roleKey)}
                            aria-label={`Remove ${roleKey}`}
                            className="text-slate-400 hover:text-rose-600"
                            disabled={savingConfig}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {band.chain.length === 0 && (
                        <span className="text-[11px] text-slate-400">
                          No steps — auto-approved
                        </span>
                      )}
                      <Select
                        className="h-8 w-36 text-xs"
                        value=""
                        onChange={(event) => {
                          addChainRole(index, event.target.value);
                          event.target.value = '';
                        }}
                        disabled={savingConfig}
                        aria-label="Add a role to the chain"
                      >
                        <option value="">Add role…</option>
                        {[...approverKeys]
                          .filter((roleKey) => !band.chain.includes(roleKey))
                          .map((roleKey) => (
                            <option key={roleKey} value={roleKey}>
                              {roleKey}
                            </option>
                          ))}
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end sm:pt-6">
                    <button
                      type="button"
                      onClick={() => removeBand(index)}
                      disabled={savingConfig || bands.length === 1}
                      aria-label="Remove band"
                      className="focus-ring rounded-md p-2 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={addBand}
                disabled={savingConfig}
              >
                <Plus className="h-3.5 w-3.5" />
                Add band
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={configAsync.refresh}
                  disabled={savingConfig}
                >
                  Reset
                </Button>
                <Button size="sm" loading={savingConfig} onClick={saveConfig}>
                  <Check className="h-3.5 w-3.5" />
                  Save config
                </Button>
              </div>
            </div>

            {configErrors.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700 ring-1 ring-rose-200">
                {configErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}

            {configSaveError && (
              <p className="mt-3 text-xs text-rose-600" role="alert">
                {configSaveError}
              </p>
            )}
          </div>

          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-medium text-ink-900">
              How bands resolve
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              A request at <strong>x%</strong> uses the band where{' '}
              <code className="rounded bg-slate-100 px-1">min &lt; x ≤ max</code>
              ; 0% (or an empty chain) is auto-approved and wins the deal
              immediately.
            </p>
          </section>
        </section>
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Permissions</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {roles.map((role) => (
                  <tr key={role._id} className="transition-colors duration-150 hover:bg-brand-50/60">
                    <td className="px-4 py-3">
                      <span className="block font-medium text-ink-900">
                        {role.key}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {role.name || 'No display name'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(role.permissions ?? []).map((permission) => (
                          <Badge key={permission.key} tone="slate">
                            {permission.key}:{permission.scope}
                          </Badge>
                        ))}
                        {(role.permissions ?? []).length === 0 && (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => startEditRole(role)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>

          <Modal
            open={Boolean(roleDraft)}
            onClose={() => {
              if (!savingRole) setRoleDraft(null);
            }}
            title={roleDraft?.id ? 'Edit role' : 'New role'}
            description="Choose the permissions and scope for this role."
            className="max-w-xl"
          >
            {roleDraft && (
              <>
              <div className="grid gap-3">
                <Field label="Key" htmlFor="role-key">
                  <Input
                    id="role-key"
                    value={roleDraft.key}
                    onChange={(event) =>
                      setRoleDraft((current) => ({
                        ...current,
                        key: event.target.value,
                      }))
                    }
                    disabled={savingRole}
                    data-autofocus
                  />
                </Field>
                <Field label="Display name" htmlFor="role-name">
                  <Input
                    id="role-name"
                    value={roleDraft.name}
                    onChange={(event) =>
                      setRoleDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    disabled={savingRole}
                  />
                </Field>
              </div>

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Permissions
              </h3>
              <ul className="mt-2 space-y-1.5">
                {permissions.map((permission) => {
                  const scope = roleDraft.permissions[permission.key];

                  return (
                    <li
                      key={permission.key}
                      className="rounded-lg bg-canvas px-2.5 py-2"
                    >
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(scope)}
                          onChange={(event) =>
                            togglePermission(permission, event.target.checked)
                          }
                          disabled={savingRole}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-500"
                        />
                        {permission.key}
                      </label>
                      <p className="ml-5 mt-0.5 text-[11px] text-slate-400">
                        {permission.description}
                      </p>
                      {scope && (
                        <div className="ml-5 mt-1.5">
                          <Select
                            className="h-8 w-36 text-xs"
                            value={scope}
                            onChange={(event) =>
                              setPermissionScope(permission, event.target.value)
                            }
                            disabled={
                              savingRole || permission.allowedScopes.length === 1
                            }
                            aria-label={`Scope for ${permission.key}`}
                          >
                            {permission.allowedScopes.map((allowed) => (
                              <option key={allowed} value={allowed}>
                                {allowed}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {roleDraft.id && (
                <p className="mt-3 text-[11px] leading-relaxed text-amber-700">
                  Renaming a key can affect approval config chains and seeded
                  data.
                </p>
              )}

              {roleError && (
                <p className="mt-2 text-xs text-rose-600" role="alert">
                  {roleError}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRoleDraft(null)}
                  disabled={savingRole}
                >
                  Cancel
                </Button>
                <Button size="sm" loading={savingRole} onClick={saveRole}>
                  <Check className="h-3.5 w-3.5" />
                  Save role
                </Button>
              </div>
              </>
            )}
          </Modal>
        </div>
      )}
    </div>
  );
}
