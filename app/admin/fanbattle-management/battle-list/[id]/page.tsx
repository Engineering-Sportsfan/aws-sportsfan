"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

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

export default function BattleDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [battle, setBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchBattle = async () => {
      try {
        const res = await axios.get(`/api/battle/${id}`);
        setBattle(res.data?.battle ?? null);
      } catch (error) {
        console.error("Failed to load battle details", error);
        setBattle(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchBattle();
  }, [id]);

  const formatDate = (ts?: number) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString();
  };

  const handleEdit = () => {
    router.push(`/admin/fanbattle-management/add-battle?id=${id}`);
  };

  const handleDelete = async () => {
    const confirmed = window.confirm("Delete this battle? This action cannot be undone.");
    if (!confirmed) return;

    try {
      await axios.delete(`/api/battle/${id}`);
      router.push("/admin/fanbattle-management/battle-list");
    } catch (error) {
      console.error("Failed to delete battle", error);
      alert("Failed to delete battle");
    }
  };

  if (loading) {
    return <div className="p-6 text-white">Loading battle details...</div>;
  }

  if (!battle) {
    return (
      <div className="p-6 text-white">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft size={20} /> Back
        </button>
        <p>Battle not found</p>
      </div>
    );
  }

  const selectedCount = (battle.selectedPlayers?.length ?? 0) + (battle.selectedClubs?.length ?? 0);

  return (
    <div className="max-w-5xl mx-auto p-6 text-white">
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition"
        >
          <ArrowLeft size={20} /> Back
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleEdit}
            className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
            title="Edit"
          >
            <Pencil size={18} />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
            title="Delete"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Battle Name</p>
          <h1 className="text-3xl font-bold text-white">{battle.battleName}</h1>
          <p className="text-sm text-gray-400 mt-2">Battle ID: {battle.id}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Battle Type</p>
              <p className="text-sm text-gray-300">{battle.battleType}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Created By</p>
              <p className="text-sm text-gray-300">{battle.userName || battle.userId || "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Created At</p>
              <p className="text-sm text-gray-300">{formatDate(battle.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Updated At</p>
              <p className="text-sm text-gray-300">{formatDate(battle.updatedAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Selections</p>
              <p className="text-sm text-gray-300">{selectedCount} item(s)</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Selected Players</p>
              {battle.selectedPlayers && battle.selectedPlayers.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {battle.selectedPlayers.map((player, index) => (
                    <span key={`${player}-${index}`} className="rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-300">
                      {player}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-1">No selected players</p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Selected Clubs</p>
              {battle.selectedClubs && battle.selectedClubs.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {battle.selectedClubs.map((club, index) => (
                    <span key={`${club}-${index}`} className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-300">
                      {club}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-1">No selected clubs</p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Invited Friends</p>
              {battle.invitedFriends && battle.invitedFriends.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {battle.invitedFriends.map((friend, index) => (
                    <div key={`${friend.email}-${index}`} className="rounded-lg border border-[#21262d] bg-[#0d1117] px-3 py-2">
                      <p className="text-sm text-white font-medium">{friend.name}</p>
                      <p className="text-xs text-gray-500">{friend.email}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-1">No invited friends</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}