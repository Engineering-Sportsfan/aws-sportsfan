"use client";

import { Fragment, useEffect, useState } from "react";
import axios from "axios";
import { Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

type BattleType = "PLAYERS" | "CLUBS";

type InvitedFriend = {
  name: string;
  email: string;
};

type Battle = {
  id: string;
  battleName: string;
  battleType: BattleType;
  selectedPlayers?: string[];
  selectedClubs?: string[];
  invitedFriends?: InvitedFriend[];
  userId?: string;
  userName?: string;
  createdAt?: number;
  updatedAt?: number;
};

type Cursor = {
  lastDocId: string;
  lastDocCreatedAt: number;
};

export default function BattleListPage() {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const LIMIT = 20;

  useEffect(() => {
    void fetchBattles();
  }, []);

  const fetchBattles = async (cursor?: Cursor) => {
    try {
      setLoading(true);

      let url = `/api/battle?limit=${LIMIT}`;
      if (cursor) {
        url += `&lastDocId=${encodeURIComponent(cursor.lastDocId)}&lastDocCreatedAt=${cursor.lastDocCreatedAt}`;
      }

      const res = await axios.get(url);
      const incoming = (res.data?.battles || []) as Battle[];

      setBattles((prev) => (cursor ? [...prev, ...incoming] : incoming));
      setHasMore(Boolean(res.data?.pagination?.hasMore));
      setNextCursor((res.data?.pagination?.nextCursor as Cursor | null) ?? null);
    } catch (error) {
      console.error("Failed to fetch battles", error);
      if (!cursor) {
        setBattles([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Delete this battle? This action cannot be undone.");
    if (!confirmed) return;

    try {
      await axios.delete(`/api/battle/${id}`);
      setBattles((prev) => prev.filter((battle) => battle.id !== id));
      setExpandedRows((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete battle");
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (ts?: number) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-white">Battles</h1>
          <p className="text-sm text-gray-400 mt-1">
            {battles.length} battle{battles.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/admin/fanbattle-management/add-battle">
          <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white text-sm transition font-medium">
            Add Battle
          </button>
        </Link>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {[
                  "#",
                  "Battle Name",
                  "Type",
                  "Created By",
                  "Players/Clubs",
                  "Invites",
                  "Created",
                  "Actions",
                ].map((head) => (
                  <th
                    key={head}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                      <span className="text-sm">Loading battles...</span>
                    </div>
                  </td>
                </tr>
              ) : battles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500 text-sm">
                    No battles found
                  </td>
                </tr>
              ) : (
                battles.map((battle, index) => {
                  const totalSelections =
                    (battle.selectedPlayers?.length ?? 0) + (battle.selectedClubs?.length ?? 0);

                  return (
                    <Fragment key={battle.id}>
                      <tr
                        className="border-b border-[#21262d] hover:bg-[#0d1117] transition cursor-pointer"
                        onClick={() => toggleRow(battle.id)}
                      >
                        <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                        <td className="px-4 py-3 text-sm text-white font-medium">{battle.battleName}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{battle.battleType}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{battle.userName || battle.userId || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{totalSelections}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{battle.invitedFriends?.length ?? 0}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{formatDate(battle.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/fanbattle-management/battle-list/${battle.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="p-2 rounded-md bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition"
                              title="View"
                            >
                              <Eye size={16} />
                            </Link>

                            <Link href={`/admin/fanbattle-management/add-battle?id=${battle.id}`}>
                              <button
                                onClick={(event) => event.stopPropagation()}
                                className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                                title="Edit"
                              >
                                <Pencil size={16} />
                              </button>
                            </Link>

                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDelete(battle.id);
                              }}
                              className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expandedRows.has(battle.id) && (
                        <tr className="bg-[#0a0f16] border-b border-[#21262d]">
                          <td colSpan={8} className="px-6 py-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              <div>
                                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Battle Details</p>
                                <p className="text-sm text-gray-300">Type: {battle.battleType}</p>
                                <p className="text-sm text-gray-300">Creator: {battle.userName || battle.userId || "-"}</p>
                                <p className="text-sm text-gray-300">Players selected: {battle.selectedPlayers?.length ?? 0}</p>
                                <p className="text-sm text-gray-300">Clubs selected: {battle.selectedClubs?.length ?? 0}</p>
                                <p className="text-sm text-gray-300">Updated: {formatDate(battle.updatedAt)}</p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Invited Friends</p>
                                {battle.invitedFriends && battle.invitedFriends.length > 0 ? (
                                  <ul className="space-y-1 text-sm text-gray-300">
                                    {battle.invitedFriends.map((friend, idx) => (
                                      <li key={`${battle.id}-${friend.email}-${idx}`}>
                                        {friend.name} - {friend.email}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-gray-500">No invited friends</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-[#21262d]">
          <p className="text-xs text-gray-500">{battles.length} loaded</p>
          {hasMore ? (
            <button
              onClick={() => {
                if (nextCursor) {
                  void fetchBattles(nextCursor);
                }
              }}
              className="px-3 py-1 rounded text-sm bg-[#21262d] text-gray-300 hover:bg-[#30363d] transition"
            >
              Load more
            </button>
          ) : (
            <span className="text-xs text-gray-500">No more results</span>
          )}
        </div>
      </div>
    </div>
  );
}
