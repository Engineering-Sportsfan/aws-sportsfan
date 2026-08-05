"use client";

import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, useEffect, Suspense } from "react";

function AddAthleteProfileForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idToEdit = searchParams.get("id");

  // State for Group A
  const [form, setForm] = useState<Record<string, any>>({
    name: "",
    country: "",
    flag: "",
    sport: "",
    age: "",
    isVerified: false,
    fansCount: "",
    height: "",
    weight: "",
    birthplace: "",
    dominantHand: "",
    coachName: "",
    yearsActiveSince: "",
    fanImpactScore: "",
    fanImpactChangePercent: "",
    hubIsNew: false,
    yAxisDomainMin: "0",
    yAxisDomainMax: "0",
    unit: "m",
  });

  const [welcomeVideo, setWelcomeVideo] = useState<Record<string, string>>({
    title: "", caption: "", thumbnailUrl: "", videoUrl: "", likeCount: "", commentCount: "", shareCount: ""
  });

  const [hubCounts, setHubCounts] = useState<Record<string, string>>({
    vodInterviews: "0", amsSessions: "0", bookings: "0", store: "0", auctions: "0"
  });

  const [currentSeason, setCurrentSeason] = useState<Record<string, string>>({
    events: "0", gold: "0", silver: "0", bronze: "0", seasonBest: "", averageThrow: "", currentStreak: ""
  });

  const [badges, setBadges] = useState<any[]>([]);
  const [medalCabinet, setMedalCabinet] = useState<any[]>([]);

  // State for Group B (raw JSON strings)
  const [groupB, setGroupB] = useState<Record<string, string>>({
    highlights: "", dropsContent: "", postsContent: "", cornerPosts: "", seasonalData: "",
    medalData: "", stats: "", radarData: "", coachImpactData: "", consistencyData: "", heatmapData: "", videosContent: ""
  });

  const [image, setImage] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState("");
  const [welcomeThumbnailFile, setWelcomeThumbnailFile] = useState<File | null>(null);
  const [welcomeVideoFile, setWelcomeVideoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [jsonErrors, setJsonErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!idToEdit) return;

    const fetchProfile = async () => {
      try {
        const res = await axios.get(`/api/admin/athleteProfile?id=${idToEdit}`);
        const data = res.data.data;
        
        setForm({
          name: data.name || "",
          country: data.country || "",
          flag: data.flag || "",
          sport: data.sport || "",
          age: data.age?.toString() || "",
          isVerified: data.isVerified || false,
          fansCount: data.fansCount || "",
          height: data.height || "",
          weight: data.weight || "",
          birthplace: data.birthplace || "",
          dominantHand: data.dominantHand || "",
          coachName: data.coachName || "",
          yearsActiveSince: data.yearsActiveSince || "",
          fanImpactScore: data.fanImpactScore?.toString() || "",
          fanImpactChangePercent: data.fanImpactChangePercent || "",
          hubIsNew: data.hubIsNew || false,
          yAxisDomainMin: data.yAxisDomain?.[0]?.toString() || "0",
          yAxisDomainMax: data.yAxisDomain?.[1]?.toString() || "0",
          unit: data.unit || "m",
        });

        if (data.welcomeVideo) setWelcomeVideo(data.welcomeVideo);
        if (data.hubCounts) setHubCounts(data.hubCounts);
        if (data.currentSeason) setCurrentSeason(data.currentSeason);
        if (data.badges) setBadges(data.badges);
        if (data.medalCabinet) setMedalCabinet(data.medalCabinet);
        
        setExistingImage(data.image || "");

        // Stringify Group B
        const groupBFields = ["highlights", "dropsContent", "postsContent", "cornerPosts", "seasonalData", "medalData", "stats", "radarData", "coachImpactData", "consistencyData", "heatmapData", "videosContent"];
        const loadedGroupB: any = {};
        groupBFields.forEach(key => {
          loadedGroupB[key] = data[key] ? JSON.stringify(data[key], null, 2) : "";
        });
        setGroupB(loadedGroupB);
      } catch (err) {
        console.error("Failed to load profile", err);
      }
    };
    fetchProfile();
  }, [idToEdit]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setForm(p => ({ ...p, [name]: checked }));
    } else {
      setForm(p => ({ ...p, [name]: value }));
    }
  };

  const handleGroupBChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setGroupB(p => ({ ...p, [name]: value }));
    
    // Auto-validate JSON on change to show inline error
    try {
      if (value.trim()) {
        JSON.parse(value);
      }
      setJsonErrors(p => ({ ...p, [name]: false }));
    } catch {
      setJsonErrors(p => ({ ...p, [name]: true }));
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const response = await axios.post("/api/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (!response.data?.success || !response.data?.url) {
      throw new Error(response.data?.message || "File upload failed");
    }
    return response.data.url;
  };

  const handleSubmit = async () => {
    if (!form.name || !form.country || !form.sport || form.age === "") {
      alert("Missing required basic fields: Name, Country, Sport, Age");
      return;
    }

    if (!idToEdit && !image && !existingImage) {
      alert("Main Image is required");
      return;
    }

    // Validate JSON errors before submitting
    const hasJsonErrors = Object.values(jsonErrors).some(err => err);
    if (hasJsonErrors) {
      alert("Please fix invalid JSON fields before submitting.");
      return;
    }

    setLoading(true);
    try {
      let imageUrl = existingImage;
      if (image) {
        imageUrl = await uploadFile(image, "Images");
      }

      let finalWelcomeThumbnailUrl = welcomeVideo.thumbnailUrl;
      if (welcomeThumbnailFile) {
        finalWelcomeThumbnailUrl = await uploadFile(welcomeThumbnailFile, "Images");
      }

      let finalWelcomeVideoUrl = welcomeVideo.videoUrl;
      if (welcomeVideoFile) {
        finalWelcomeVideoUrl = await uploadFile(welcomeVideoFile, "Videos");
      }

      const payload = {
        ...form,
        yAxisDomain: [Number(form.yAxisDomainMin), Number(form.yAxisDomainMax)],
        welcomeVideo: {
          ...welcomeVideo,
          thumbnailUrl: finalWelcomeThumbnailUrl,
          videoUrl: finalWelcomeVideoUrl
        },
        hubCounts: {
          vodInterviews: Number(hubCounts.vodInterviews),
          amsSessions: Number(hubCounts.amsSessions),
          bookings: Number(hubCounts.bookings),
          store: Number(hubCounts.store),
          auctions: Number(hubCounts.auctions)
        },
        currentSeason: {
          events: Number(currentSeason.events),
          gold: Number(currentSeason.gold),
          silver: Number(currentSeason.silver),
          bronze: Number(currentSeason.bronze),
          seasonBest: currentSeason.seasonBest,
          averageThrow: currentSeason.averageThrow,
          currentStreak: currentSeason.currentStreak
        },
        badges: badges.map(b => ({ ...b, year: Number(b.year) })),
        medalCabinet: medalCabinet.map(m => ({ ...m, year: Number(m.year) })),
        image: imageUrl,
        ...groupB // include raw JSON strings, backend will parse
      };

      if (idToEdit) {
        await axios.put(`/api/admin/athleteProfile?id=${idToEdit}`, payload);
        alert("Athlete updated successfully");
      } else {
        await axios.post(`/api/admin/athleteProfile`, payload);
        alert("Athlete created successfully");
      }
      router.push("/admin/athlete-management/list");
    } catch (error: any) {
      console.error(error);
      alert(error.response?.data?.error || error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-gray-200">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-xl font-semibold text-white">
          {idToEdit ? "Edit Athlete Profile" : "Create Athlete Profile"}
        </h1>
        <button onClick={() => router.push("/admin/athlete-management/list")} className="text-sm bg-gray-700 px-4 py-2 rounded hover:bg-gray-600">Back to List</button>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-8">
        
        {/* GROUP A */}
        <section>
          <h2 className="text-lg font-bold border-b border-[#21262d] pb-2 mb-4 text-white">Group A: Standard Fields</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Name *" name="name" value={form.name} onChange={handleChange} />
            <Input label="Country *" name="country" value={form.country} onChange={handleChange} />
            <Input label="Flag (Emoji)" name="flag" value={form.flag} onChange={handleChange} />
            <Input label="Sport *" name="sport" value={form.sport} onChange={handleChange} />
            <Input type="number" label="Age *" name="age" value={form.age} onChange={handleChange} />
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Main Image *</label>
              <input type="file" onChange={(e) => setImage(e.target.files?.[0] ?? null)} className="w-full text-sm text-white border border-gray-700 rounded cursor-pointer bg-[#0d1117] px-3 py-2" />
              {existingImage && !image && <img src={existingImage} className="h-12 w-12 object-cover mt-1 rounded" alt="Current" />}
              {image && <img src={URL.createObjectURL(image)} className="h-12 w-12 object-cover mt-1 rounded" alt="Preview" />}
            </div>

            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input type="checkbox" name="isVerified" checked={form.isVerified} onChange={handleChange} />
              <span className="text-sm">Is Verified?</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input type="checkbox" name="hubIsNew" checked={form.hubIsNew} onChange={handleChange} />
              <span className="text-sm">Hub Is New?</span>
            </label>

            <Input label="Fans Count (e.g. 4.8M)" name="fansCount" value={form.fansCount} onChange={handleChange} />
            <Input label="Height (e.g. 1.86 m)" name="height" value={form.height} onChange={handleChange} />
            <Input label="Weight (e.g. 86 kg)" name="weight" value={form.weight} onChange={handleChange} />
            <Input label="Birthplace" name="birthplace" value={form.birthplace} onChange={handleChange} />
            
            <div>
              <label className="text-xs text-gray-400">Dominant Hand</label>
              <select name="dominantHand" value={form.dominantHand} onChange={handleChange} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white">
                <option value="">Select...</option>
                <option value="Right">Right</option>
                <option value="Left">Left</option>
                <option value="Ambidextrous">Ambidextrous</option>
              </select>
            </div>
            <Input label="Coach Name" name="coachName" value={form.coachName} onChange={handleChange} />
            <Input label="Years Active Since (e.g. 2016)" name="yearsActiveSince" value={form.yearsActiveSince} onChange={handleChange} />
            
            <Input type="number" label="Fan Impact Score (0-100)" name="fanImpactScore" value={form.fanImpactScore} onChange={handleChange} />
            <Input label="Fan Impact Change (e.g. +14%)" name="fanImpactChangePercent" value={form.fanImpactChangePercent} onChange={handleChange} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Input type="number" label="Y-Axis Domain Min" name="yAxisDomainMin" value={form.yAxisDomainMin} onChange={handleChange} />
            <Input type="number" label="Y-Axis Domain Max" name="yAxisDomainMax" value={form.yAxisDomainMax} onChange={handleChange} />
            <div>
              <label className="text-xs text-gray-400">Unit</label>
              <select name="unit" value={form.unit} onChange={handleChange} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white">
                <option value="m">m</option>
                <option value="s">s</option>
                <option value="kg">kg</option>
                <option value="pts">pts</option>
              </select>
            </div>
          </div>
        </section>

        {/* WELCOME VIDEO */}
        <section>
          <h3 className="text-md font-bold mb-2 text-white">Welcome Video</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Title" value={welcomeVideo.title} onChange={e => setWelcomeVideo(p => ({...p, title: e.target.value}))} />
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Thumbnail File</label>
              <input type="file" accept="image/*" onChange={(e) => setWelcomeThumbnailFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-white border border-gray-700 rounded cursor-pointer bg-[#0d1117] px-3 py-2" />
              {welcomeVideo.thumbnailUrl && !welcomeThumbnailFile && <span className="text-xs text-gray-500 truncate">Current: {welcomeVideo.thumbnailUrl}</span>}
              {welcomeThumbnailFile && <span className="text-xs text-green-400 truncate">New: {welcomeThumbnailFile.name}</span>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Video File</label>
              <input type="file" accept="video/*" onChange={(e) => setWelcomeVideoFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-white border border-gray-700 rounded cursor-pointer bg-[#0d1117] px-3 py-2" />
              {welcomeVideo.videoUrl && !welcomeVideoFile && <span className="text-xs text-gray-500 truncate">Current: {welcomeVideo.videoUrl}</span>}
              {welcomeVideoFile && <span className="text-xs text-green-400 truncate">New: {welcomeVideoFile.name}</span>}
            </div>

            <Input label="Like Count" value={welcomeVideo.likeCount} onChange={e => setWelcomeVideo(p => ({...p, likeCount: e.target.value}))} />
            <Input label="Comment Count" value={welcomeVideo.commentCount} onChange={e => setWelcomeVideo(p => ({...p, commentCount: e.target.value}))} />
            <Input label="Share Count" value={welcomeVideo.shareCount} onChange={e => setWelcomeVideo(p => ({...p, shareCount: e.target.value}))} />
            <div className="md:col-span-3">
              <label className="text-xs text-gray-400">Caption</label>
              <textarea value={welcomeVideo.caption} onChange={e => setWelcomeVideo(p => ({...p, caption: e.target.value}))} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white" rows={2} />
            </div>
          </div>
        </section>

        {/* HUB COUNTS */}
        <section>
          <h3 className="text-md font-bold mb-2 text-white">Hub Counts</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Input type="number" label="VOD Interviews" value={hubCounts.vodInterviews} onChange={e => setHubCounts(p => ({...p, vodInterviews: e.target.value}))} />
            <Input type="number" label="AMS Sessions" value={hubCounts.amsSessions} onChange={e => setHubCounts(p => ({...p, amsSessions: e.target.value}))} />
            <Input type="number" label="Bookings" value={hubCounts.bookings} onChange={e => setHubCounts(p => ({...p, bookings: e.target.value}))} />
            <Input type="number" label="Store" value={hubCounts.store} onChange={e => setHubCounts(p => ({...p, store: e.target.value}))} />
            <Input type="number" label="Auctions" value={hubCounts.auctions} onChange={e => setHubCounts(p => ({...p, auctions: e.target.value}))} />
          </div>
        </section>

        {/* CURRENT SEASON */}
        <section>
          <h3 className="text-md font-bold mb-2 text-white">Current Season</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input type="number" label="Events" value={currentSeason.events} onChange={e => setCurrentSeason(p => ({...p, events: e.target.value}))} />
            <Input type="number" label="Gold" value={currentSeason.gold} onChange={e => setCurrentSeason(p => ({...p, gold: e.target.value}))} />
            <Input type="number" label="Silver" value={currentSeason.silver} onChange={e => setCurrentSeason(p => ({...p, silver: e.target.value}))} />
            <Input type="number" label="Bronze" value={currentSeason.bronze} onChange={e => setCurrentSeason(p => ({...p, bronze: e.target.value}))} />
            <Input label="Season Best (e.g. 88.94 m)" value={currentSeason.seasonBest} onChange={e => setCurrentSeason(p => ({...p, seasonBest: e.target.value}))} />
            <Input label="Avg Throw (e.g. 87.72 m)" value={currentSeason.averageThrow} onChange={e => setCurrentSeason(p => ({...p, averageThrow: e.target.value}))} />
            <Input label="Current Streak (e.g. 4 Podiums)" value={currentSeason.currentStreak} onChange={e => setCurrentSeason(p => ({...p, currentStreak: e.target.value}))} />
          </div>
        </section>

        {/* BADGES */}
        <section>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-md font-bold text-white">Badges</h3>
            <button onClick={() => setBadges(p => [...p, { code: "", label: "", iconUrl: "", year: "" }])} className="text-xs bg-blue-600 px-2 py-1 rounded text-white">Add Badge</button>
          </div>
          {badges.map((b, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2 items-center bg-[#0d1117] p-2 rounded border border-gray-700">
              <Input label="Code (e.g. OLYMPIC_CHAMPION)" value={b.code} onChange={e => { const v = [...badges]; v[i].code = e.target.value; setBadges(v); }} />
              <Input label="Label (e.g. Olympic Champion)" value={b.label} onChange={e => { const v = [...badges]; v[i].label = e.target.value; setBadges(v); }} />
              <Input label="Icon URL" value={b.iconUrl} onChange={e => { const v = [...badges]; v[i].iconUrl = e.target.value; setBadges(v); }} />
              <Input type="number" label="Year" value={b.year} onChange={e => { const v = [...badges]; v[i].year = e.target.value; setBadges(v); }} />
              <button onClick={() => setBadges(p => p.filter((_, idx) => idx !== i))} className="text-red-400 mt-4">Remove</button>
            </div>
          ))}
        </section>

        {/* MEDAL CABINET */}
        <section>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-md font-bold text-white">Medal Cabinet</h3>
            <button onClick={() => setMedalCabinet(p => [...p, { competition: "", medalType: "gold", year: "", iconUrl: "" }])} className="text-xs bg-blue-600 px-2 py-1 rounded text-white">Add Medal</button>
          </div>
          {medalCabinet.map((m, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2 items-center bg-[#0d1117] p-2 rounded border border-gray-700">
              <Input label="Competition (e.g. Olympics)" value={m.competition} onChange={e => { const v = [...medalCabinet]; v[i].competition = e.target.value; setMedalCabinet(v); }} />
              <div className="flex flex-col">
                <label className="text-xs text-gray-400">Medal Type</label>
                <select value={m.medalType} onChange={e => { const v = [...medalCabinet]; v[i].medalType = e.target.value; setMedalCabinet(v); }} className="bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white">
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                  <option value="bronze">Bronze</option>
                  <option value="winner">Winner</option>
                </select>
              </div>
              <Input type="number" label="Year" value={m.year} onChange={e => { const v = [...medalCabinet]; v[i].year = e.target.value; setMedalCabinet(v); }} />
              <Input label="Icon URL" value={m.iconUrl} onChange={e => { const v = [...medalCabinet]; v[i].iconUrl = e.target.value; setMedalCabinet(v); }} />
              <button onClick={() => setMedalCabinet(p => p.filter((_, idx) => idx !== i))} className="text-red-400 mt-4">Remove</button>
            </div>
          ))}
        </section>

        {/* GROUP B */}
        <section className="pt-6 border-t border-[#21262d]">
          <h2 className="text-lg font-bold border-b border-[#21262d] pb-2 mb-4 text-white">Group B: Advanced Analytics / JSON Data</h2>
          <p className="text-sm text-gray-400 mb-4">
            These fields require valid JSON arrays or objects. Do not enter plain text.<br/>
            Note for `dropsContent`: Each item should ideally have a `readMin` field and `type: "Document"`.
          </p>
          <div className="space-y-4">
            {Object.keys(groupB).map(key => (
              <div key={key} className="bg-[#0d1117] border border-gray-700 p-4 rounded">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-white capitalize">{key}</label>
                  {jsonErrors[key] && <span className="text-xs text-red-500 bg-red-500/10 px-2 py-1 rounded">Invalid JSON</span>}
                </div>
                <textarea
                  name={key}
                  value={groupB[key]}
                  onChange={handleGroupBChange}
                  placeholder={`[\n  // Add ${key} JSON here\n]`}
                  className={`w-full bg-[#161b22] border px-3 py-2 rounded text-sm font-mono ${jsonErrors[key] ? 'border-red-500 text-red-400' : 'border-gray-700 text-green-400'} min-h-[150px]`}
                />
              </div>
            ))}
          </div>
        </section>

        {/* SUBMIT */}
        <div className="flex gap-4 pt-4">
          <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded hover:bg-blue-500 disabled:opacity-50">
            {loading ? "Saving..." : (idToEdit ? "Update Athlete Profile" : "Create Athlete Profile")}
          </button>
          <button onClick={() => router.push("/admin/athlete-management/list")} className="flex-1 bg-gray-700 text-white font-semibold py-3 rounded hover:bg-gray-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-white">Loading...</div>}>
      <AddAthleteProfileForm />
    </Suspense>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

// Reusable Input
function Input({ label, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input {...props} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
    </div>
  );
}
