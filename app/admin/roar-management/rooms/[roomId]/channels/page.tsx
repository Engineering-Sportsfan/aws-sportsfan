// app/admin/roar-management/rooms/[roomId]/channels/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";
import { Plus, X, ArrowUp, ArrowDown, Edit2, Save } from "lucide-react";

interface Channel {
  channelId: string;
  name: string;
  slug: string;
  icon: string;
  isActive: boolean;
  order: number;
}

export default function ManageChannelsPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [hasChannels, setHasChannels] = useState(false);
  
  // New channel form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelIcon, setNewChannelIcon] = useState('💬');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  const iconOptions = ['💬', '📢', '🎙️', '📺', '🎮', '🏆', '⭐', '🔥', '💡', '🎯', '🗣️', '📝', '🎨', '⚡'];

  const fetchChannels = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/roar/rooms/${roomId}/channels`);
      const channelsData = res.data.channels || [];
      setChannels(channelsData);
      setHasChannels(channelsData.length > 0);
      
      // Get room name
      const roomRes = await axios.get(`/api/roar/rooms/${roomId}`);
      setRoomName(roomRes.data.room?.name || '');
    } catch (error) {
      console.error("Failed to fetch channels", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (roomId) {
      fetchChannels();
    }
  }, [roomId]);

  const handleAddChannel = async () => {
    if (!newChannelName.trim()) return;

    setSaving(true);
    try {
      const slug = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
      await axios.post(`/api/roar/rooms/${roomId}/channels`, {
        name: newChannelName.trim(),
        slug,
        icon: newChannelIcon,
        order: channels.length,
        isActive: true,
      });
      
      await fetchChannels();
      setNewChannelName('');
      setNewChannelIcon('💬');
      setShowAddForm(false);
    } catch (error: any) {
      console.error("Failed to add channel", error);
      alert(error.response?.data?.error || 'Failed to add channel');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateChannel = async (channelId: string, updates: Partial<Channel>) => {
    setSaving(true);
    try {
      await axios.patch(`/api/roar/rooms/${roomId}/channels/${channelId}`, updates);
      await fetchChannels();
      setEditingChannelId(null);
    } catch (error: any) {
      console.error("Failed to update channel", error);
      alert(error.response?.data?.error || 'Failed to update channel');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (channels.length <= 1) {
      alert('Room must have at least one active channel');
      return;
    }
    
    if (!confirm('Delete this channel? This action cannot be undone.')) return;
    
    setSaving(true);
    try {
      await axios.delete(`/api/roar/rooms/${roomId}/channels/${channelId}`);
      await fetchChannels();
    } catch (error: any) {
      console.error("Failed to delete channel", error);
      alert(error.response?.data?.error || 'Failed to delete channel');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= channels.length) return;
    
    const newChannels = [...channels];
    [newChannels[index], newChannels[newIndex]] = [newChannels[newIndex], newChannels[index]];
    
    // Update orders
    const updates = newChannels.map((ch, i) => ({
      ...ch,
      order: i,
    }));
    
    setChannels(updates);
    
    // Save to server
    try {
      await Promise.all(
        updates.map(ch => 
          axios.patch(`/api/roar/rooms/${roomId}/channels/${ch.channelId}`, { order: ch.order })
        )
      );
    } catch (error) {
      console.error("Failed to reorder channels", error);
      await fetchChannels(); // Revert on error
    }
  };

  const startEditing = (channel: Channel) => {
    setEditingChannelId(channel.channelId);
    setEditName(channel.name);
    setEditIcon(channel.icon);
  };

  const cancelEditing = () => {
    setEditingChannelId(null);
    setEditName('');
    setEditIcon('');
  };

  return (
    <div className="max-w-[900px] mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Manage Channels
          </h1>
          <p className="text-sm text-gray-400">
            {roomName ? `Room: ${roomName}` : 'Loading...'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Channels are optional. You can create them now or leave this room without channels.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/roar-management/roar-list')}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
        >
          ← Back to Rooms
        </button>
      </div>

      {/* No Channels Message */}
      {!loading && !hasChannels && (
        <div className="mb-6 bg-[#161b22] border border-[#21262d] rounded-lg p-6 text-center">
          <p className="text-gray-400 mb-3">This room doesn't have any channels yet.</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold text-white transition mx-auto"
          >
            <Plus size={18} />
            Add First Channel
          </button>
        </div>
      )}

      {/* Add Channel Button */}
      {hasChannels && !showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="mb-6 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold text-white transition"
        >
          <Plus size={18} />
          Add Channel
        </button>
      )}

      {/* Add Channel Form */}
      {showAddForm && (
        <div className="mb-6 bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Add New Channel</h3>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={newChannelIcon}
              onChange={(e) => setNewChannelIcon(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm"
            >
              {iconOptions.map(ico => (
                <option key={ico} value={ico}>{ico}</option>
              ))}
            </select>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Channel name"
              className="flex-1 min-w-[200px] bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleAddChannel()}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddChannel}
                disabled={saving || !newChannelName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white font-semibold transition disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewChannelName('');
                }}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-lg text-sm text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channels List */}
      {hasChannels && (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1c2330] border-b border-[#21262d]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Icon
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Slug
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500 mx-auto mb-2"></div>
                      Loading channels...
                    </td>
                  </tr>
                ) : (
                  channels.map((channel, index) => (
                    <tr
                      key={channel.channelId}
                      className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                    >
                      {/* Order */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-400 w-6 text-center">
                            {index + 1}
                          </span>
                          <div className="flex flex-col">
                            <button
                              onClick={() => handleReorder(index, 'up')}
                              disabled={index === 0 || saving}
                              className="p-0.5 text-gray-400 hover:text-white disabled:opacity-30"
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              onClick={() => handleReorder(index, 'down')}
                              disabled={index === channels.length - 1 || saving}
                              className="p-0.5 text-gray-400 hover:text-white disabled:opacity-30"
                            >
                              <ArrowDown size={12} />
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Icon */}
                      <td className="px-4 py-3 text-lg">
                        {editingChannelId === channel.channelId ? (
                          <select
                            value={editIcon}
                            onChange={(e) => setEditIcon(e.target.value)}
                            className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-white text-sm"
                          >
                            {iconOptions.map(ico => (
                              <option key={ico} value={ico}>{ico}</option>
                            ))}
                          </select>
                        ) : (
                          channel.icon || '💬'
                        )}
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3">
                        {editingChannelId === channel.channelId ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-white text-sm"
                          />
                        ) : (
                          <span className="text-sm font-medium text-white">
                            {channel.name}
                          </span>
                        )}
                      </td>

                      {/* Slug */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">
                          /{channel.slug}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                          channel.isActive
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {channel.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {editingChannelId === channel.channelId ? (
                            <>
                              <button
                                onClick={() => handleUpdateChannel(channel.channelId, {
                                  name: editName.trim(),
                                  icon: editIcon,
                                })}
                                disabled={saving || !editName.trim()}
                                className="p-1.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition disabled:opacity-50"
                                title="Save"
                              >
                                <Save size={16} />
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="p-1.5 rounded bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition"
                                title="Cancel"
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditing(channel)}
                                className="p-1.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleUpdateChannel(channel.channelId, {
                                  isActive: !channel.isActive,
                                })}
                                className={`p-1.5 rounded transition ${
                                  channel.isActive
                                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                    : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                }`}
                                title={channel.isActive ? 'Deactivate' : 'Activate'}
                              >
                                {channel.isActive ? '🔴' : '🟢'}
                              </button>
                              <button
                                onClick={() => handleDeleteChannel(channel.channelId)}
                                disabled={saving || channels.length <= 1}
                                className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                                title="Delete"
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}