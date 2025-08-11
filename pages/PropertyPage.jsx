// Property Media & Inspection Notes — modeled after your login card aesthetic
// - Two-column layout: gallery (left) + notes panel (right)
// - Clean card UI, rounded-2xl corners, soft shadows, roomy padding
// - Drop-in component; pass `propertyId` and API base URL
// - Wire-up outline provided; replace fetch URLs to match your backend once PATCH route is ready

const React = window.React ?? require("react");

export default function PropertyMediaNotes({ propertyId, apiBase = "http://localhost:4000" }) {
  const [property, setProperty] = React.useState(null);
  const [activeImageKey, setActiveImageKey] = React.useState(null);
  const [captionDraft, setCaptionDraft] = React.useState("");
  const [inspectionNoteDraft, setInspectionNoteDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState("inspection"); // inspection | maintenance | marketing

  React.useEffect(() => {
    (async () => {
      const res = await fetch(`${apiBase}/api/properties/${propertyId}`);
      if (!res.ok) return;
      const data = await res.json();
      setProperty(data);
      // choose first image
      if (data?.images?.length) setActiveImageKey(data.images[0].key);
    })();
  }, [propertyId]);

  if (!property) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse rounded-2xl border bg-white p-8 shadow-sm">
          <div className="h-6 w-48 rounded bg-gray-200 mb-4" />
          <div className="h-4 w-80 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  const images = property.images || [];
  const activeImage = images.find((i) => i.key === activeImageKey) || null;

  async function saveCaption() {
    if (!activeImage) return;
    setSaving(true);
    try {
      // TODO: create a backend PATCH route to update image captions by image key
      // For now, we simulate success
      await new Promise((r) => setTimeout(r, 400));
      alert("(demo) Saved caption: " + captionDraft);
    } finally {
      setSaving(false);
    }
  }

  async function addInspectionNote() {
    if (!inspectionNoteDraft.trim()) return;
    setSaving(true);
    try {
      // TODO: call your PATCH /api/properties/:id to push into inspectionNotes[]
      await new Promise((r) => setTimeout(r, 400));
      alert("(demo) Added inspection note: " + inspectionNoteDraft);
      setInspectionNoteDraft("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Media & Inspection Notes</h1>
          <p className="text-sm text-gray-500">{property.title || "Untitled"} — {[property.address1, property.city, property.state].filter(Boolean).join(", ")}</p>
        </header>

        <div className="grid gap-6 md:grid-cols-12">
          {/* Gallery */}
          <section className="md:col-span-7">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Gallery</h2>
                <div className="text-sm text-gray-500">{images.length} image{images.length === 1 ? "" : "s"}</div>
              </div>

              {/* Big preview */}
              <div className="aspect-[16/10] overflow-hidden rounded-xl border bg-gray-100">
                {activeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeImage.url} alt="active" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">No images yet</div>
                )}
              </div>

              {/* Thumbnails */}
              <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-5">
                {images.map((img) => (
                  <button
                    key={img.key}
                    className={`overflow-hidden rounded-xl border ${activeImageKey === img.key ? "ring-2 ring-black" : ""}`}
                    onClick={() => setActiveImageKey(img.key)}
                    title={img.key}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="thumb" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>

              {/* Image caption editor */}
              <div className="mt-4 rounded-xl border p-3">
                <label className="mb-1 block text-sm font-medium">Image Caption / Note</label>
                <div className="flex gap-2">
                  <input
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    placeholder="e.g., Water stain above window, NE bedroom"
                    className="flex-1 rounded-xl border p-2 focus:outline-none focus:ring"
                  />
                  <button onClick={saveCaption} disabled={saving || !activeImage} className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60">
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Attach a short note to the selected image.</p>
              </div>
            </div>
          </section>

          {/* Notes Panel */}
          <aside className="md:col-span-5">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Notes</h2>
                <div className="flex gap-1">
                  {[
                    { id: "inspection", label: "Inspection" },
                    { id: "maintenance", label: "Maintenance" },
                    { id: "marketing", label: "Marketing" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`rounded-2xl border px-3 py-1 text-sm ${tab === t.id ? "bg-black text-white" : "bg-white"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Composer */}
              <div className="rounded-xl border p-3">
                <label className="mb-1 block text-sm font-medium">Add {tab} note</label>
                <textarea
                  value={inspectionNoteDraft}
                  onChange={(e) => setInspectionNoteDraft(e.target.value)}
                  placeholder={tab === "inspection" ? "Ex: Observed minor efflorescence on basement N wall." : "Write a note..."}
                  className="min-h-[100px] w-full rounded-xl border p-2 focus:outline-none focus:ring"
                />
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-xs text-gray-500">Saved notes appear below.</div>
                  <button onClick={addInspectionNote} disabled={saving || !inspectionNoteDraft.trim()} className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60">
                    {saving ? "Saving..." : "Add Note"}
                  </button>
                </div>
              </div>

              {/* Notes list (demo: show property.notes if present) */}
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-gray-600">Recent notes</h3>
                {property.notes ? (
                  <div className="rounded-xl border p-3 text-sm leading-6">{property.notes}</div>
                ) : (
                  <p className="text-sm text-gray-400">No notes yet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// If you need a plain HTML/CSS entry point for testing, you can mount like this:
// <div id="root"></div>
// ReactDOM.createRoot(document.getElementById('root')).render(<PropertyMediaNotes propertyId="..." />);
