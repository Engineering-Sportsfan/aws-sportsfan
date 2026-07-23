// app/admin/onboarding-management/add-onboarding/page.tsx
'use client';

import { useEffect, useState } from "react";
import axios from "axios";

type ConfigType = "sports" | "followEntities" | "engagement";

type ConfigItem = {
  id: string;
  label: string;
  order: number;
  active: boolean;
  image?: string; // sports icon (data URL or hosted URL)
  icon?: string; // engagement icon (emoji) / followEntities badge text
  description?: string; // engagement description (stored as `subtitle` on the record)
  category?: string; // followEntities section title
  sportId?: string; // followEntities section's sport
};

const CONFIG_API = "/api/roar/onboarding-config";

const inputClass =
  "w-full border border-gray-600 rounded px-3 py-2 bg-gray-800 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-orange-400";
const labelClass = "block text-xs font-medium text-gray-400 mb-1";

// Reads a File into a data URL. Swap this out for a real upload endpoint
// (e.g. Firebase Storage) once one exists — this keeps the panel usable now.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OnboardingConfigAdmin() {
  const [tab, setTab] = useState<ConfigType>("sports");
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [sportsList, setSportsList] = useState<ConfigItem[]>([]); // for followEntities section sport dropdown
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // sports / engagement: single-item edit form
  const [editing, setEditing] = useState<any | null>(null);

  // followEntities: sections derived from items, plus in-progress "new section" / "new option" forms
  const [newSection, setNewSection] = useState<{ category: string; sportId: string } | null>(null);
  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null); // category key
  const [optionDraft, setOptionDraft] = useState<{ icon: string; label: string }>({
    icon: "",
    label: "",
  });
  const [editingEntity, setEditingEntity] = useState<ConfigItem | null>(null);

  const load = async (type: ConfigType) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await axios.get(`${CONFIG_API}?type=${type}&all=true`);
      setItems(res.data.items ?? []);
    } catch (err: any) {
      console.error(err);
      setItems([]);
      setLoadError(
        err?.response?.status
          ? `Failed to load (${err.response.status}). Check that ${CONFIG_API} exists and you're logged in as an admin.`
          : "Failed to reach the config API. Check your connection and that the route exists."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(tab);
    setEditing(null);
    setNewSection(null);
    setAddingOptionFor(null);
    setEditingEntity(null);
    if (tab === "followEntities" && sportsList.length === 0) {
      axios
        .get(`${CONFIG_API}?type=sports&all=true`)
        .then((r) => setSportsList(r.data.items ?? []))
        .catch((err) => console.error(err));
    }
  }, [tab]); // eslint-disable-line

  // ---------- sports / engagement (flat list) ----------

  const saveFlat = async () => {
    if (!editing) return;
    const payload = { ...editing };
    try {
      if (payload.id) {
        await axios.patch(CONFIG_API, { type: tab, id: payload.id, updates: payload });
        setEditing(null);
      } else {
        await axios.post(CONFIG_API, { type: tab, item: payload });
        // keep the form open on create so multiple items can be added in a row;
        // reset it to a blank template rather than closing it.
        setEditing(
          tab === "sports"
            ? { label: "", image: "", active: true, order: items.length + 1 }
            : { label: "", icon: "", subtitle: "", active: true, order: items.length + 1 }
        );
      }
      await load(tab);
    } catch (err) {
      console.error(err);
      alert("Save failed — check the console for details.");
    }
  };

  const remove = async (type: ConfigType, id: string) => {
    if (!confirm("Delete this item?")) return;
    try {
      await axios.delete(`${CONFIG_API}?type=${type}&id=${id}`);
      load(type);
    } catch (err) {
      console.error(err);
      alert("Delete failed — check the console for details.");
    }
  };

  const toggleActive = async (type: ConfigType, item: ConfigItem) => {
    try {
      await axios.patch(CONFIG_API, { type, id: item.id, updates: { active: !item.active } });
      load(type);
    } catch (err) {
      console.error(err);
      alert("Update failed — check the console for details.");
    }
  };

  const handleIconUpload = async (file: File | null) => {
    if (!file || !editing) return;
    const dataUrl = await fileToDataUrl(file);
    setEditing({ ...editing, image: dataUrl });
  };

  // ---------- followEntities (sections) ----------

  const sections = items.reduce((acc: Record<string, ConfigItem[]>, item) => {
    const key = item.category || "Untitled section";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const createSectionFirstOption = async () => {
    if (!newSection || !newSection.category || !newSection.sportId) return;
    if (!optionDraft.label) return;
    try {
      await axios.post(CONFIG_API, {
        type: "followEntities",
        item: {
          label: optionDraft.label,
          icon: optionDraft.icon,
          category: newSection.category,
          sportId: newSection.sportId,
          order: items.length,
        },
      });
      const createdCategory = newSection.category;
      setNewSection(null);
      setOptionDraft({ icon: "", label: "" });
      setAddingOptionFor(createdCategory);
      load("followEntities");
    } catch (err) {
      console.error(err);
      alert("Save failed — check the console for details.");
    }
  };

  const addOptionToSection = async (category: string, sportId: string) => {
    if (!optionDraft.label) return;
    try {
      await axios.post(CONFIG_API, {
        type: "followEntities",
        item: {
          label: optionDraft.label,
          icon: optionDraft.icon,
          category,
          sportId,
          order: items.length,
        },
      });
      // keep the inline "add option" row open for this section so multiple
      // options can be added in a row; just clear the draft fields.
      setOptionDraft({ icon: "", label: "" });
      load("followEntities");
    } catch (err) {
      console.error(err);
      alert("Save failed — check the console for details.");
    }
  };

  const saveEntity = async () => {
    if (!editingEntity) return;
    try {
      await axios.patch(CONFIG_API, {
        type: "followEntities",
        id: editingEntity.id,
        updates: editingEntity,
      });
      setEditingEntity(null);
      load("followEntities");
    } catch (err) {
      console.error(err);
      alert("Save failed — check the console for details.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 text-gray-100 min-h-screen bg-gray-950">
      <h1 className="text-2xl font-bold mb-4 text-gray-50">ROAR Onboarding Config</h1>

      <div className="flex gap-2 mb-6">
        {(
          [
            { key: "sports", label: "Sports (Step 1)" },
            { key: "followEntities", label: "Follow Entities (Step 2)" },
            { key: "engagement", label: "Engagement (Step 3)" },
          ] as { key: ConfigType; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              tab === t.key
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-gray-900 text-gray-300 border-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && loadError && (
        <div className="border border-red-800 bg-red-950/40 text-red-300 text-sm rounded-lg p-4 mb-6">
          {loadError}
        </div>
      )}

      {/* ---------------- SPORTS ---------------- */}
      {!loading && tab === "sports" && (
        <>
          <button
            onClick={() => setEditing({ label: "", image: "", active: true, order: items.length })}
            className="mb-4 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
          >
            + Add sport
          </button>

          {editing && (
            <div className="border border-gray-700 rounded-xl p-4 mb-6 bg-gray-900 space-y-3 shadow-lg max-w-md">
              <div>
                <label className={labelClass}>Icon</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleIconUpload(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-gray-700 file:text-gray-100 file:cursor-pointer"
                />
                {editing.image && (
                  <img
                    src={editing.image}
                    alt="preview"
                    className="w-12 h-12 object-contain mt-2 rounded bg-gray-800 p-1"
                  />
                )}
              </div>
              <div>
                <label className={labelClass}>Sport name</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Cricket"
                  value={editing.label || ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveFlat}
                  className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border border-gray-700 rounded-lg px-4 py-3 bg-gray-900"
              >
                <div className="flex items-center gap-3">
                  {item.image && (
                    <img src={item.image} alt="" className="w-8 h-8 object-contain rounded bg-gray-800 p-1" />
                  )}
                  <p className="font-medium text-gray-100">
                    {item.label} {!item.active && <span className="text-xs text-red-400">(inactive)</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleActive("sports", item)}
                    className="text-xs px-3 py-1.5 rounded bg-gray-800 text-gray-200 border border-gray-600"
                  >
                    {item.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="text-xs px-3 py-1.5 rounded bg-blue-900 text-blue-200 border border-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove("sports", item.id)}
                    className="text-xs px-3 py-1.5 rounded bg-red-900 text-red-200 border border-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && !loadError && <p className="text-sm text-gray-500">No sports yet.</p>}
          </div>
        </>
      )}

      {/* ---------------- FOLLOW ENTITIES ---------------- */}
      {!loading && tab === "followEntities" && (
        <>
          <button
            onClick={() => {
              setNewSection({ category: "", sportId: "" });
              setOptionDraft({ icon: "", label: "" });
            }}
            className="mb-4 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
          >
            + Add section
          </button>

          {newSection && (
            <div className="border border-gray-700 rounded-xl p-4 mb-6 bg-gray-900 space-y-3 shadow-lg max-w-md">
              <p className="text-sm font-semibold text-gray-200">New section</p>
              <div>
                <label className={labelClass}>Section title</label>
                <input
                  className={inputClass}
                  placeholder="e.g. CRICKET — INDIA & IPL"
                  value={newSection.category}
                  onChange={(e) => setNewSection({ ...newSection, category: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Sport</label>
                <select
                  className={inputClass}
                  value={newSection.sportId}
                  onChange={(e) => setNewSection({ ...newSection, sportId: e.target.value })}
                >
                  <option value="">Select sport…</option>
                  {sportsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs font-medium text-gray-400 pt-1">First option in this section</p>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="Badge (e.g. IN)"
                  value={optionDraft.icon}
                  onChange={(e) => setOptionDraft({ ...optionDraft, icon: e.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="Label (e.g. India Men)"
                  value={optionDraft.label}
                  onChange={(e) => setOptionDraft({ ...optionDraft, label: e.target.value })}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={createSectionFirstOption}
                  className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium"
                >
                  Create section
                </button>
                <button
                  onClick={() => setNewSection(null)}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editingEntity && (
            <div className="border border-gray-700 rounded-xl p-4 mb-6 bg-gray-900 space-y-3 shadow-lg max-w-md">
              <p className="text-sm font-semibold text-gray-200">Edit option</p>
              <div>
                <label className={labelClass}>Badge text</label>
                <input
                  className={inputClass}
                  value={editingEntity.icon || ""}
                  onChange={(e) => setEditingEntity({ ...editingEntity, icon: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Label</label>
                <input
                  className={inputClass}
                  value={editingEntity.label || ""}
                  onChange={(e) => setEditingEntity({ ...editingEntity, label: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Section title</label>
                <input
                  className={inputClass}
                  value={editingEntity.category || ""}
                  onChange={(e) => setEditingEntity({ ...editingEntity, category: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Sport</label>
                <select
                  className={inputClass}
                  value={editingEntity.sportId || ""}
                  onChange={(e) => setEditingEntity({ ...editingEntity, sportId: e.target.value })}
                >
                  <option value="">Select sport…</option>
                  {sportsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveEntity}
                  className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingEntity(null)}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {Object.entries(sections).map(([category, entities]) => {
              const sportId = entities[0]?.sportId || "";
              return (
                <div key={category} className="border border-gray-800 rounded-xl p-4 bg-gray-900/40">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-100">{category}</p>
                      <p className="text-xs text-gray-500">
                        sport: {sportsList.find((s) => s.id === sportId)?.label || sportId}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setAddingOptionFor(category);
                        setOptionDraft({ icon: "", label: "" });
                      }}
                      className="text-xs px-3 py-1.5 rounded bg-green-900 text-green-200 border border-green-700"
                    >
                      + Add option
                    </button>
                  </div>

                  {addingOptionFor === category && (
                    <div className="flex gap-2 mb-3">
                      <input
                        className={inputClass}
                        placeholder="Badge (e.g. MI)"
                        value={optionDraft.icon}
                        onChange={(e) => setOptionDraft({ ...optionDraft, icon: e.target.value })}
                      />
                      <input
                        className={inputClass}
                        placeholder="Label (e.g. Mumbai Indians)"
                        value={optionDraft.label}
                        onChange={(e) => setOptionDraft({ ...optionDraft, label: e.target.value })}
                      />
                      <button
                        onClick={() => addOptionToSection(category, sportId)}
                        className="px-3 rounded-lg bg-orange-500 text-white text-sm font-medium whitespace-nowrap"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setAddingOptionFor(null)}
                        className="px-3 rounded-lg bg-gray-700 text-gray-100 text-sm font-medium whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {entities.map((ent) => (
                      <div
                        key={ent.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
                          ent.active ? "border-gray-600 bg-gray-800 text-gray-100" : "border-red-800 bg-gray-800 text-red-300"
                        }`}
                      >
                        {ent.icon && <span className="text-xs font-bold text-orange-400">{ent.icon}</span>}
                        <span>{ent.label}</span>
                        <button onClick={() => setEditingEntity(ent)} className="text-blue-300 text-xs">
                          edit
                        </button>
                        <button onClick={() => toggleActive("followEntities", ent)} className="text-gray-400 text-xs">
                          {ent.active ? "hide" : "show"}
                        </button>
                        <button onClick={() => remove("followEntities", ent.id)} className="text-red-400 text-xs">
                          delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {Object.keys(sections).length === 0 && !loadError && (
              <p className="text-sm text-gray-500">No sections yet.</p>
            )}
          </div>
        </>
      )}

      {/* ---------------- ENGAGEMENT ---------------- */}
      {!loading && tab === "engagement" && (
        <>
          <button
            onClick={() =>
              setEditing({ label: "", icon: "", description: "", active: true, order: items.length })
            }
            className="mb-4 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
          >
            + Add option
          </button>

          {editing && (
            <div className="border border-gray-700 rounded-xl p-4 mb-6 bg-gray-900 space-y-3 shadow-lg max-w-md">
              <div>
                <label className={labelClass}>Icon (emoji)</label>
                <input
                  className={inputClass}
                  placeholder="🎯"
                  value={editing.icon || ""}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Title</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Predicting outcomes & scores"
                  value={editing.label || ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Get prediction prompts before and during matches"
                  value={editing.subtitle || ""}
                  onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveFlat}
                  className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border border-gray-700 rounded-lg px-4 py-3 bg-gray-900"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-lg">
                    {item.icon || "⭐"}
                  </span>
                  <div>
                    <p className="font-medium text-gray-100">
                      {item.label} {!item.active && <span className="text-xs text-red-400">(inactive)</span>}
                    </p>
                    <p className="text-xs text-gray-500">{(item as any).subtitle}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleActive("engagement", item)}
                    className="text-xs px-3 py-1.5 rounded bg-gray-800 text-gray-200 border border-gray-600"
                  >
                    {item.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="text-xs px-3 py-1.5 rounded bg-blue-900 text-blue-200 border border-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove("engagement", item.id)}
                    className="text-xs px-3 py-1.5 rounded bg-red-900 text-red-200 border border-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && !loadError && <p className="text-sm text-gray-500">No options yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}