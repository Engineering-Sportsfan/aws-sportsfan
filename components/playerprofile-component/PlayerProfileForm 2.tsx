"use client";

import axios from "axios";
import { ChangeEvent, useState, useRef } from "react";
import {
    ProfileForm,
    Input,
    Textarea,
    FileInput,
    SectionTitle,
    Divider,
    FormActions,
    getPreview,
} from "./shared";

//  PROPS 

type Props = {
    profileIdToEdit?: string;
    initialForm?: ProfileForm;
    initialAvatar?: string;
    onSaved: (profileId: string) => void;
    onCancel: () => void;
};

//  DEFAULT FORM 

export const defaultProfileForm: ProfileForm = {
    name: "",
    team: "",
    battingStyle: "",
    bowlingStyle: "",
    about: "",
    statsRuns: "",
    statsSr: "",
    statsAvg: "",
    iplDebut: "",
    specialization: "",
    dob: "",
    matches: "",
    avatarPreview: ""
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normalise a header key: lowercase + collapse spaces/underscores */
const normalise = (s: string) =>
    s.toLowerCase().replace(/[\s_]+/g, " ").trim();

/**
 * Build a lookup map from the raw row so we can do flexible partial-key matching.
 * Keys are normalised; values are trimmed strings.
 */
const buildLookup = (row: Record<string, unknown>): Record<string, string> =>
    Object.keys(row).reduce((acc, k) => {
        acc[normalise(k)] = String(row[k] ?? "").trim();
        return acc;
    }, {} as Record<string, string>);

/**
 * Return the first value whose normalised key INCLUDES any of the given fragments.
 * Fragments are also normalised before comparison.
 */
const findVal = (
    lookup: Record<string, string>,
    ...fragments: string[]
): string => {
    for (const frag of fragments) {
        const normFrag = normalise(frag);
        const matchedKey = Object.keys(lookup).find((k) => k.includes(normFrag));
        if (matchedKey !== undefined && lookup[matchedKey] !== "") {
            return lookup[matchedKey];
        }
    }
    return "";
};

// Add this helper above processBatch
async function withRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    delayMs = 1000
): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt === retries - 1) throw err;
            await new Promise((res) => setTimeout(res, delayMs * (attempt + 1)));
        }
    }
    throw new Error("Max retries exceeded");
}

/** Process rows in parallel batches to avoid overwhelming the server */
// async function processBatch<T>(
//     items: T[],
//     batchSize: number,
//     handler: (item: T, index: number) => Promise<void>,
//     onProgress: (done: number) => void
// ) {
//     let done = 0;
//     for (let i = 0; i < items.length; i += batchSize) {
//         const chunk = items.slice(i, i + batchSize);
//         await Promise.all(
//             chunk.map(async (item, j) => {
//                 await handler(item, i + j);
//                 done++;
//                 onProgress(done);
//             })
//         );
//     }
// }
async function processBatch<T>(
    items: T[],
    batchSize: number,
    handler: (item: T, index: number) => Promise<void>,
    onProgress: (done: number) => void
) {
    let done = 0;
    for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        await Promise.all(
            chunk.map(async (item, j) => {
                await handler(item, i + j);
                done++;
                onProgress(done);
            })
        );
        // Add delay between batches to avoid overwhelming the server
        if (i + batchSize < items.length) {
            await new Promise((res) => setTimeout(res, 800)); // 800ms pause
        }
    }
}

//  COMPONENT 

export default function PlayerProfileForm({
    profileIdToEdit,
    initialForm = defaultProfileForm,
    initialAvatar = "",
    onSaved,
    onCancel,
}: Props) {
    const [form, setForm] = useState<ProfileForm>(initialForm);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [errors, setErrors] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Bulk Excel import 


    const handleExcelUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setErrors([]);
        setProgress({ current: 0, total: 0 });

        try {
            const XLSX = await import("xlsx");

            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

            if (!data.length) {
                alert("The uploaded file is empty.");
                return;
            }

            let successCount = 0;
            const failedRows: string[] = [];

            setProgress({ current: 0, total: data.length });

            await processBatch(
                data,
                2,
                async (row, idx) => {
                    const lookup = buildLookup(row);

                    // const playerForm = {
                    //     name: findVal(lookup, "player", "name", "player name"),
                    //     team: findVal(lookup, "team"),
                    //     battingStyle: findVal(lookup, "bat hand", "batting style", "batting"),
                    //     bowlingStyle: findVal(lookup, "bowling type", "bowl type", "bowling style", "bowl"),
                    //     age: findVal(lookup, "age in yrs", "age"),
                    //     dob: findVal(lookup, "age") ? `${findVal(lookup, "age")} yrs` : "",


                    //     statsSr: findVal(lookup, "batting sr_ipl", "batting sr_overall", "batting sr", "strike rate"),
                    //     statsAvg: findVal(lookup, "batting avg_ipl", "batting avg_overall", "batting avg", "average"),
                    //     statsRuns: findVal(lookup, "runs_ipl", "runs_overall", "total runs", "runs"),

                    //     matches: findVal(lookup, "innings_ipl", "innings_overall", "innings", "matches"),
                    //     specialization: findVal(lookup, "role", "specialization"),
                    //     // FIX: "ipl debut" and "about" columns do not exist in the sheet — removed fallback
                    //     // Add these columns to the Excel sheet if needed, otherwise they will be empty
                    //     iplDebut: findVal(lookup, "ipl debut", "debut") ?? "",
                    //     about: findVal(lookup, "about", "description") ?? "",
                    // };


                    const playerForm = {
                        name: findVal(lookup, "player", "name", "player name"),
                        team: findVal(lookup, "team"),
                        battingStyle: findVal(lookup, "bat hand", "batting style", "batting"),
                        bowlingStyle: findVal(lookup, "bowling type", "bowl type", "bowling style", "bowl"),
                        age: findVal(lookup, "age in yrs", "age"),
                        dob: findVal(lookup, "dob") || (findVal(lookup, "age in yrs", "age") ? `${findVal(lookup, "age in yrs", "age")} yrs` : ""),

                        statsSr: findVal(lookup, "batting sr_ipl", "batting sr_overall", "batting sr", "strike rate"),
                        statsAvg: findVal(lookup, "batting avg_ipl", "batting avg_overall", "batting avg", "average"),
                        statsRuns: findVal(lookup, "runs_ipl", "runs_overall", "total runs", "runs"),

                        matches: findVal(lookup, "innings_ipl", "innings_overall", "innings", "matches"),
                        specialization: findVal(lookup, "role", "specialization"),
                        iplDebut: findVal(lookup, "ipl debut year", "ipl debut", "debut"),
                        about: findVal(lookup, "about", "description"),
                        avatarPreview: findVal(lookup, "Player avatar"),
                    };

                    if (!playerForm.name || !playerForm.team) {
                        failedRows.push(
                            `Row ${idx + 2}: Missing name ("${playerForm.name}") or team ("${playerForm.team}")`
                        );
                        return;
                    }

                    // try {
                    //     // Step 1 — Create player profile
                    //     const fd = new FormData();
                    //     Object.entries(playerForm).forEach(([k, v]) => fd.append(k, v));
                    //     const profileRes = await axios.post("/api/player-profile", fd);
                    //     const newProfileId: string = profileRes.data.profile.id;

                    //     // Step 2 — Create home post
                    //     await withRetry(() => axios.post("/api/player-profile/home", {
                    //         playerName: playerForm.name,
                    //         title: findVal(lookup, "title"),
                    //         likes: findVal(lookup, "likes"),
                    //         comments: findVal(lookup, "comments"),
                    //         live: findVal(lookup, "live"),
                    //         shares: findVal(lookup, "shares"),
                    //         playerProfilesId: newProfileId,
                    //     }));

                    //     // Step 3 — Create season stats

                    //     await withRetry(() => axios.post("/api/player-profile/seasonstats", {
                    //         playerProfilesId: newProfileId,
                    //         season: {
                    //             year: findVal(lookup, "year") ?? "2026",
                    //             runs: findVal(lookup, "runs_ipl26", "runs_ipl", "runs_overall", "runs"),
                    //             strikeRate: findVal(lookup, "batting sr_ipl26", "batting sr_ipl", "batting sr_overall", "batting sr", "strike rate"),
                    //             average: findVal(lookup, "batting avg_ipl26", "batting avg_ipl", "batting avg_overall", "batting avg", "average"),
                    //             wickets: findVal(lookup, "wickets_ipl26", "wickets_ipl", "wickets_overall", "wickets"),
                    //             fiftiesAndHundreds: findVal(lookup, "50s_100s_IPL26"),
                    //             highestScore: findVal(lookup, "HS_IPL26"),
                    //             fours: findVal(lookup, "_raw_bat_fours_IPL26"),
                    //             sixes: findVal(lookup, "_raw_bat_sixes_IPL26"),
                    //             threeW_fiveW_Hauls: findVal(lookup, "3W_5W_IPL26"),
                    //             foursConceded: findVal(lookup, "_raw_bowl_fours_IPL26"),
                    //             sixesConceded: findVal(lookup, "_raw_bowl_sixes_IPL26"),
                    //             bestBowling: findVal(lookup, "BB_IPL26"),
                    //             economy: findVal(lookup, "econ_ipl26", "econ_ipl", "econ_overall", "econ", "economy"),
                    //             bowlingSR: findVal(lookup, "bowling sr_ipl26", "bowling sr_ipl", "bowling sr_overall", "bowling sr", "bowlingsr"),
                    //             bowlingAvg: findVal(lookup, "bowling avg_ipl26", "bowling avg_ipl", "bowling avg_overall", "bowling avg", "bowlingavg"),
                    //             jerseyNo: findVal(lookup, "Jersey No.", "jersey no"),
                    //         },
                    //     }));

                    //     successCount++;
                    // }
                    try {
                        // Step 1 — Create player profile (with avatar URL if present)
                        const fd = new FormData();
                        Object.entries(playerForm).forEach(([k, v]) => fd.append(k, v));
                        const avatarUrl = findVal(lookup, "player avatar", "avatar");
                        if (avatarUrl) fd.append("avatarPreview", avatarUrl);
                        const profileRes = await axios.post("/api/player-profile", fd);
                        const newProfileId: string = profileRes.data.profile.id;

                        // Step 2 — Create home post (with Player Image + Team Image as categories)
                        const playerImageUrl = findVal(lookup, "player image");
                        const teamImageUrl = findVal(lookup, "team image");
                        const homeCategories: { title: string; image: string }[] = [];
                        if (playerImageUrl) homeCategories.push({ title: "Player", image: playerImageUrl });
                        if (teamImageUrl) homeCategories.push({ title: "Team", image: teamImageUrl });

                        await withRetry(() => axios.post("/api/player-profile/home", {
                            playerName: playerForm.name,
                            title: findVal(lookup, "player title", "title"),
                            likes: findVal(lookup, "likes"),
                            comments: findVal(lookup, "comments"),
                            live: findVal(lookup, "live"),
                            shares: findVal(lookup, "shares"),
                            image: playerImageUrl,
                            logo: teamImageUrl,
                            category: homeCategories,
                            playerProfilesId: newProfileId,
                        }));

                        // Step 3 — Create season stats
                        await withRetry(() => axios.post("/api/player-profile/seasonstats", {
                            playerProfilesId: newProfileId,
                            season: {
                                year: findVal(lookup, "year") ?? "2026",
                                runs: findVal(lookup, "runs_ipl26", "runs_ipl", "runs_overall", "runs"),
                                strikeRate: findVal(lookup, "batting sr_ipl26", "batting sr_ipl", "batting sr_overall", "batting sr", "strike rate"),
                                average: findVal(lookup, "batting avg_ipl26", "batting avg_ipl", "batting avg_overall", "batting avg", "average"),
                                wickets: findVal(lookup, "wickets_ipl26", "wickets_ipl", "wickets_overall", "wickets"),
                                fiftiesAndHundreds: findVal(lookup, "50s_100s_ipl26"),
                                highestScore: findVal(lookup, "hs_ipl26"),
                                fours: findVal(lookup, "_raw_bat_fours_ipl26"),
                                sixes: findVal(lookup, "_raw_bat_sixes_ipl26"),
                                threeW_fiveW_Hauls: findVal(lookup, "3w_5w_ipl26"),
                                foursConceded: findVal(lookup, "_raw_bowl_fours_ipl26"),
                                sixesConceded: findVal(lookup, "_raw_bowl_sixes_ipl26"),
                                bestBowling: findVal(lookup, "bb_ipl26"),
                                economy: findVal(lookup, "econ_ipl26", "econ_ipl", "econ_overall", "econ", "economy"),
                                bowlingSR: findVal(lookup, "bowling sr_ipl26", "bowling sr_ipl", "bowling sr_overall", "bowling sr", "bowlingsr"),
                                bowlingAvg: findVal(lookup, "bowling avg_ipl26", "bowling avg_ipl", "bowling avg_overall", "bowling avg", "bowlingavg"),
                                jerseyNo: findVal(lookup, "Jersey", "jersey", "Jersey No.", "jersey no.", "Jersey No", "jersey No"),
                            },
                        }));
                        console.log("Available columns:", Object.keys(lookup));
                        console.log("Jersey value:", findVal(lookup, "Jersey", "jersey", "Jersey No.", "jersey no."));
                        // Step 4 — Create insights (NEW)
                        const insightTitle = findVal(lookup, "insight title");
                        const insightDescription = findVal(lookup, "insight description");
                        const strength1 = findVal(lookup, "strength 1");
                        const strength2 = findVal(lookup, "strength 2");
                        const insights = insightTitle
                            ? [{ title: insightTitle, description: insightDescription }]
                            : [];
                        const strengths = [strength1, strength2].filter(Boolean);

                        await withRetry(() => axios.post("/api/player-profile/insights", {
                            playerProfilesId: newProfileId,
                            insights,
                            strengths,
                        }));

                        // Step 5 — Create media
                        const mediaImageUrl = findVal(lookup, "media image");
                        const photoTitle = findVal(lookup, "photo title");
                        const views = findVal(lookup, "views");
                        const time = findVal(lookup, "time");

                        if (mediaImageUrl || photoTitle) {
                            const mediaFd = new FormData();
                            mediaFd.append("playerProfilesId", newProfileId);
                            mediaFd.append("titles", photoTitle || `${playerForm.name} Photo`);
                            mediaFd.append("views", views || "0");
                            mediaFd.append("times", time || "");
                            mediaFd.append("existingThumbnails", mediaImageUrl || "");
                            // Don't append an empty blob — only append if there's an actual file
                            // The API uses existingThumbnails when no new file is uploaded
                            await withRetry(() => axios.post("/api/player-profile/media", mediaFd));
                        }
                        successCount++;
                    }
                    catch (err: unknown) {
                        const msg =
                            axios.isAxiosError(err)
                                ? `${err.response?.status ?? ""} ${JSON.stringify(err.response?.data ?? err.message)}`
                                : String(err);
                        failedRows.push(`Row ${idx + 2} (${playerForm.name}): ${msg}`);
                    }
                },
                (done) => setProgress((p) => ({ ...p, current: done }))
            );

            setErrors(failedRows);
            alert(
                `Bulk import complete!\n✅ ${successCount} succeeded\n❌ ${failedRows.length} failed` +
                (failedRows.length ? "\n\nSee error log below the upload button." : "")
            );
        } catch (err) {
            console.error(err);
            alert("Failed to parse the Excel file. Make sure it is a valid .xlsx / .xls / .csv.");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
            setProgress((p) => ({ ...p, current: p.total }));
        }
    };

    // ── Single-player form 

    const handleChange = (
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        if (!form.name || !form.team) {
            alert("Name and Team are required");
            return;
        }
        setLoading(true);
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v));
            if (avatarFile) fd.append("avatar", avatarFile);

            let res;
            if (profileIdToEdit) {
                res = await axios.put(`/api/player-profile/${profileIdToEdit}`, fd);
                onSaved(profileIdToEdit);
            } else {
                res = await axios.post("/api/player-profile", fd);
                onSaved(res.data.profile.id);
            }

            if (res.data.success) {
                alert(profileIdToEdit ? "Profile updated!" : "Profile created!");
            }
        } catch (err) {
            console.error(err);
            alert("Error saving profile");
        } finally {
            setLoading(false);
        }
    };

    const avatarPreview = getPreview(avatarFile, initialAvatar);
    const importInProgress = progress.total > 0 && progress.current < progress.total;

    return (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">

            {/* ── Bulk Import ── */}
            <div className="bg-blue-900/10 border border-blue-800/30 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-blue-400">
                            Bulk Import from Excel
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Upload a spreadsheet to import{" "}
                            <strong>all players at once</strong>. Each row = one player.
                        </p>
                    </div>
                    <div>
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleExcelUpload}
                        />
                        <button
                            type="button"
                            disabled={importInProgress}
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-4 py-2 rounded transition"
                        >
                            {importInProgress ? "Importing…" : "Upload Excel"}
                        </button>
                    </div>
                </div>

                {/* Progress bar */}
                {progress.total > 0 && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>
                                {progress.current} / {progress.total} rows processed
                            </span>
                            <span>
                                {Math.round((progress.current / progress.total) * 100)}%
                            </span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2">
                            <div
                                className="bg-blue-500 h-2 rounded-full transition-all"
                                style={{
                                    width: `${(progress.current / progress.total) * 100}%`,
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Error log */}
                {errors.length > 0 && (
                    <details className="mt-2">
                        <summary className="text-xs text-red-400 cursor-pointer">
                            ❌ {errors.length} row(s) failed — click to expand
                        </summary>
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                            {errors.map((e, i) => (
                                <p key={i} className="text-xs text-red-300 font-mono bg-red-900/10 px-2 py-1 rounded">
                                    {e}
                                </p>
                            ))}
                        </div>
                    </details>
                )}
            </div>

            {/* ── Basic Info ── */}
            <SectionTitle title="Basic Info" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label="Player Name *"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Virat Kohli"
                />
                <Input
                    label="Team Code *"
                    name="team"
                    value={form.team}
                    onChange={handleChange}
                    placeholder="e.g. RCB"
                />
                <Input
                    label="Batting Style"
                    name="battingStyle"
                    value={form.battingStyle}
                    onChange={handleChange}
                    placeholder="e.g. Right-handed"
                />
                <Input
                    label="Bowling Style"
                    name="bowlingStyle"
                    value={form.bowlingStyle}
                    onChange={handleChange}
                    placeholder="e.g. Right-arm fast-medium"
                />
            </div>

            <Divider />

            {/* ── About ── */}
            <SectionTitle title="About" />
            <Textarea
                label="About the Player"
                name="about"
                value={form.about}
                onChange={handleChange}
                placeholder="Write a brief description of the player..."
            />

            <Divider />

            {/* ── Avatar ── */}
            <SectionTitle title="Avatar / Logo" />
            <div className="flex items-start gap-4">
                <div className="flex-1">
                    <FileInput label="Upload Avatar / Club Logo" onChange={setAvatarFile} />
                </div>
                {avatarPreview && (
                    <img
                        src={avatarPreview}
                        alt="avatar preview"
                        className="w-24 h-24 object-cover rounded-full border-2 border-[#30363d] mt-5 shrink-0"
                    />
                )}
            </div>

            <Divider />

            {/* ── Stats ── */}
            <SectionTitle title="Stats" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                    label="Runs"
                    name="statsRuns"
                    value={form.statsRuns}
                    onChange={handleChange}
                    placeholder="e.g. 6211"
                />
                <Input
                    label="Strike Rate"
                    name="statsSr"
                    value={form.statsSr}
                    onChange={handleChange}
                    placeholder="e.g. 130.4"
                />
                <Input
                    label="Average"
                    name="statsAvg"
                    value={form.statsAvg}
                    onChange={handleChange}
                    placeholder="e.g. 31.3"
                />
            </div>

            <Divider />

            {/* ── Overview ── */}
            <SectionTitle title="Overview" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label="IPL Debut"
                    name="iplDebut"
                    value={form.iplDebut}
                    onChange={handleChange}
                    placeholder="e.g. 2008"
                />
                <Input
                    label="Specialization"
                    name="specialization"
                    value={form.specialization}
                    onChange={handleChange}
                    placeholder="e.g. Right-arm fast-medium"
                />
                <Input
                    label="Date of Birth"
                    name="dob"
                    value={form.dob}
                    onChange={handleChange}
                    placeholder="e.g. 1998-05-20"
                />
                <Input
                    label="Matches"
                    name="matches"
                    value={form.matches}
                    onChange={handleChange}
                    placeholder="e.g. 150"
                />
            </div>

            <FormActions
                onSave={handleSubmit}
                onCancel={onCancel}
                loading={loading}
                isEdit={!!profileIdToEdit}
                saveLabel="Save & Continue →"
            />
        </div>
    );
}