"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { User, Flame, TrendingUp, Target, Loader2 } from "lucide-react";

interface Player {
  id: string;
  name: string;
  team: string;
  avatar: string;
}

interface SpotlightData {
  playersToWatch: Player[];
  impactPlayers: Player[];
  consistentPerformers: Player[];
}

const TEAM_COLORS: Record<string, string> = {
  RCB: "#cc0000", SRH: "#f26522", GT: "#1d4e9b", PBKS: "#dd4444",
  CSK: "#f9cd05", RR: "#254aa5", DC: "#2561ae", KKR: "#3a225d",
  MI: "#004c93", LSG: "#a5c8e1",
};

export default function SpotlightPlayers() {
  const [data, setData] = useState<SpotlightData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get("/api/spotlight");
        if (res.data.success) {
          setData(res.data.data);
        }
      } catch (error) {
        console.error("Failed to fetch spotlight players", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[#101016] border border-[rgba(255,255,255,0.07)] rounded-2xl h-64 flex items-center justify-center">
            <Loader2 className="animate-spin text-gray-700" size={24} />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <SpotlightCard
        title="Players to Watch"
        subtitle="Rising stars to keep an eye on"
        icon={<Target className="text-pink-500" size={20} />}
        players={data.playersToWatch}
        accentColor="from-pink-500/20"
        borderColor="border-pink-500/20"
      />
      <SpotlightCard
        title="Impact Players"
        subtitle="Game changers who make the difference"
        icon={<Flame className="text-orange-500" size={20} />}
        players={data.impactPlayers}
        accentColor="from-orange-500/20"
        borderColor="border-orange-500/20"
      />
      <SpotlightCard
        title="Consistent Performers"
        subtitle="Reliable performers with consistent records"
        icon={<TrendingUp className="text-blue-400" size={20} />}
        players={data.consistentPerformers}
        accentColor="from-blue-400/20"
        borderColor="border-blue-400/20"
      />
    </div>
  );
}

function SpotlightCard({ title, subtitle, icon, players, accentColor, borderColor }: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  players: Player[];
  accentColor: string;
  borderColor: string;
}) {
  return (
    <div className={`bg-[#101016] border ${borderColor} rounded-2xl overflow-hidden relative group transition-all hover:border-[rgba(255,255,255,0.12)] shadow-xl`}>
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${accentColor} to-transparent`} />
      
      <div className="p-5 pb-4 flex items-start gap-4">
        <div className="bg-[#16161e] p-2.5 rounded-xl border border-[rgba(255,255,255,0.05)] shadow-inner">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
          <p className="text-xs text-gray-500 font-medium">{subtitle}</p>
        </div>
      </div>

      <div className="px-5 pb-6 pt-2">
        <div className="flex justify-around items-end gap-2">
          {players.slice(0, 3).map((player, idx) => {
            const teamColor = TEAM_COLORS[player.team] || "#8888a2";
            return (
              <div key={player.id || idx} className="flex flex-col items-center group/player">
                <div className="relative mb-3">
                  <div 
                    className="absolute inset-0 rounded-full blur-md opacity-20 transition-opacity group-hover/player:opacity-40"
                    style={{ backgroundColor: teamColor }}
                  />
                  <div 
                    className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 bg-[#09090e] shadow-2xl transition-transform group-hover/player:scale-105"
                    style={{ borderColor: `${teamColor}40` }}
                  >
                    {player.avatar ? (
                      <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-700 bg-[#16161e]">
                        <User size={32} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-center space-y-0.5">
                  <div className="text-[10px] sm:text-xs font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]">
                    {player.name}
                  </div>
                  <div 
                    className="text-[9px] font-black uppercase tracking-wider"
                    style={{ color: teamColor }}
                  >
                    {player.team}
                  </div>
                </div>
              </div>
            );
          })}
          
          {players.length === 0 && (
            <div className="w-full py-8 text-center text-gray-600 italic text-xs">
              Stay tuned for updates
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
