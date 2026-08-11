"use client";

import axios from "axios";
import { useEffect, useState } from "react";

interface StoreOrder {
  id: string;
  orderId?: string;
  userId?: string;
  productId?: string;
  productType?: string;
  category?: string;
  title?: string;
  price?: number;
  pricePaise?: number;
  paymentMethod?: string;
  status?: string;
  deliveryStatus?: string;
  trackingNumber?: string;
  adminNotes?: string;
  athleteId?: string;
  athleteName?: string;
  listingId?: string;
  listingTitle?: string;
  listingType?: string;
  fulfillmentType?: string;
  eventDate?: string;
  eventMode?: string;
  qrToken?: string;
  joinToken?: string;
  checkedIn?: boolean;
  checkedInAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function AthleteStoreOrderManagement() {
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Selected Order for Edit/View Modal
  const [selectedOrder, setSelectedOrder] = useState<StoreOrder | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editDeliveryStatus, setEditDeliveryStatus] = useState("");
  const [editTrackingNumber, setEditTrackingNumber] = useState("");
  const [editAdminNotes, setEditAdminNotes] = useState("");
  const [editCheckedIn, setEditCheckedIn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [selectedCategory, selectedStatus]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.append("category", selectedCategory);
      if (selectedStatus !== "all") params.append("status", selectedStatus);

      const res = await axios.get(`/api/admin/storeManagement/athleteStore?${params.toString()}`);
      if (res.data.success) {
        setOrders(res.data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch store orders:", error);
      alert("Failed to load store orders.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditModal = (order: StoreOrder) => {
    setSelectedOrder(order);
    setEditStatus(order.status || "upcoming");
    setEditDeliveryStatus(order.deliveryStatus || "");
    setEditTrackingNumber(order.trackingNumber || "");
    setEditAdminNotes(order.adminNotes || "");
    setEditCheckedIn(Boolean(order.checkedIn));
  };

  const handleSaveChanges = async () => {
    if (!selectedOrder) return;
    try {
      setSaving(true);
      const payload = {
        id: selectedOrder.id || selectedOrder.orderId,
        status: editStatus,
        deliveryStatus: editDeliveryStatus || undefined,
        trackingNumber: editTrackingNumber,
        adminNotes: editAdminNotes,
        checkedIn: editCheckedIn,
      };

      const res = await axios.put(`/api/admin/storeManagement/athleteStore?id=${selectedOrder.id}`, payload);
      if (res.data.success) {
        alert("Order updated successfully!");
        setSelectedOrder(null);
        fetchOrders();
      }
    } catch (error) {
      console.error("Failed to update order:", error);
      alert("Failed to update order.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrder = async (id: string, orderDisplayId?: string) => {
    const confirm = window.confirm(`Are you sure you want to delete order "${orderDisplayId || id}"?`);
    if (!confirm) return;

    try {
      const res = await axios.delete(`/api/admin/storeManagement/athleteStore?id=${id}`);
      if (res.data.success) {
        alert("Order deleted successfully!");
        fetchOrders();
      }
    } catch (error) {
      console.error("Failed to delete order:", error);
      alert("Failed to delete order.");
    }
  };

  // Filtered orders for client-side search input
  const filteredOrders = orders.filter((order) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (order.orderId || order.id || "").toLowerCase().includes(s) ||
      (order.userId || "").toLowerCase().includes(s) ||
      (order.title || "").toLowerCase().includes(s) ||
      (order.athleteName || "").toLowerCase().includes(s)
    );
  });

  // Calculate Order Statistics
  const totalOrders = orders.length;
  const totalRevenuePaise = orders.reduce((sum, o) => sum + (o.pricePaise || (o.price ? o.price * 100 : 0)), 0);
  const completedCount = orders.filter((o) => ["completed", "paid"].includes((o.status || "").toLowerCase())).length;
  const pendingCount = orders.filter((o) => ["upcoming", "pending", "processing"].includes((o.status || "").toLowerCase())).length;

  const formatPrice = (order: StoreOrder) => {
    if (order.pricePaise !== undefined && order.pricePaise !== null) {
      return `₹${(order.pricePaise / 100).toLocaleString("en-IN")}`;
    }
    if (order.price !== undefined && order.price !== null) {
      return `₹${order.price.toLocaleString("en-IN")}`;
    }
    return "₹0";
  };

  const getStatusBadgeClass = (status?: string) => {
    const st = (status || "").toLowerCase();
    switch (st) {
      case "completed":
      case "paid":
        return "bg-green-500/10 text-green-400 border border-green-500/30";
      case "upcoming":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/30";
      case "pending":
      case "processing":
        return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30";
      case "cancelled":
      case "refunded":
        return "bg-red-500/10 text-red-400 border border-red-500/30";
      default:
        return "bg-gray-500/10 text-gray-400 border border-gray-500/30";
    }
  };

  const getCategoryBadgeClass = (cat?: string) => {
    const c = (cat || "").toLowerCase();
    switch (c) {
      case "athletes":
        return "bg-purple-500/10 text-purple-400 border border-purple-500/30";
      case "events":
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30";
      case "merchandise":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/30";
      case "digital":
        return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30";
      case "auctions":
        return "bg-pink-500/10 text-pink-400 border border-pink-500/30";
      case "memberships":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
      default:
        return "bg-blue-500/10 text-blue-400 border border-blue-500/30";
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-gray-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Store Order Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            Monitor and manage user orders across Athletes, Events, Merchandise, Digital, & Memberships.
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="self-start md:self-auto bg-[#21262d] hover:bg-[#30363d] text-white px-4 py-2 rounded-lg text-sm border border-gray-700 transition"
        >
          🔄 Refresh Orders
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-lg">
          <span className="text-xs text-gray-400 uppercase font-semibold">Total Orders</span>
          <p className="text-2xl font-bold text-white mt-1">{totalOrders}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-lg">
          <span className="text-xs text-gray-400 uppercase font-semibold">Total Revenue</span>
          <p className="text-2xl font-bold text-green-400 mt-1">
            ₹{(totalRevenuePaise / 100).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-lg">
          <span className="text-xs text-gray-400 uppercase font-semibold">Completed Orders</span>
          <p className="text-2xl font-bold text-blue-400 mt-1">{completedCount}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] p-4 rounded-lg">
          <span className="text-xs text-gray-400 uppercase font-semibold">Pending / Upcoming</span>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{pendingCount}</p>
        </div>
      </div>

      {/* Controls & Filters */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="w-full md:w-1/3">
          <input
            type="text"
            placeholder="Search Order ID, User ID, Item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Category & Status Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="athletes">Athletes</option>
              <option value="memorabilia">Memorabilia</option>
              <option value="digital">Digital Products</option>
              <option value="events">Events</option>
              <option value="experiences">Experiences</option>
              <option value="auctions">Auctions</option>
              <option value="brands">Brands</option>
              <option value="coaches">Coaches</option>
              <option value="memberships">Memberships</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="upcoming">Upcoming</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading store orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No store orders found matching criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0d1117] border-b border-[#21262d] text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-6 py-4">Order ID & Date</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Product / Item Title</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#1c2128] transition">
                    <td className="px-6 py-4">
                      <div className="font-mono text-white font-semibold">
                        {order.orderId || order.id}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "N/A"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-gray-300 truncate max-w-[140px]" title={order.userId}>
                        {order.userId || "Guest"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white truncate max-w-[220px]" title={order.title}>
                        {order.title || order.listingTitle || "Untitled Product"}
                      </div>
                      {order.athleteName && (
                        <div className="text-xs text-purple-400">Athlete: {order.athleteName}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${getCategoryBadgeClass(order.category || order.productType)}`}>
                        {order.category || order.productType || "General"}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-semibold text-white">
                      {formatPrice(order)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${getStatusBadgeClass(order.status)}`}>
                        {order.status || "Unknown"}
                      </span>
                      {order.deliveryStatus && (
                        <div className="text-xs text-gray-400 mt-1 capitalize">
                          Delivery: <span className="text-yellow-400">{order.deliveryStatus}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      <button
                        onClick={() => handleOpenEditModal(order)}
                        className="text-blue-400 hover:text-blue-300 font-medium text-xs bg-blue-500/10 px-3 py-1.5 rounded border border-blue-500/20"
                      >
                        Manage
                      </button>
                      <button
                        onClick={() => handleDeleteOrder(order.id, order.orderId)}
                        className="text-red-400 hover:text-red-300 font-medium text-xs bg-red-500/10 px-3 py-1.5 rounded border border-red-500/20"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / View Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#161b22] border border-[#21262d] w-full max-w-2xl rounded-lg p-6 space-y-6 shadow-2xl my-8">
            <div className="flex justify-between items-start border-b border-[#21262d] pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Manage Order</h2>
                <p className="text-xs text-gray-400 font-mono mt-1">ID: {selectedOrder.orderId || selectedOrder.id}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-white text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* Read-Only Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-[#0d1117] p-4 rounded-lg border border-gray-700">
              <div>
                <span className="text-xs text-gray-400 block">Item / Product</span>
                <span className="font-semibold text-white">{selectedOrder.title || "N/A"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Category</span>
                <span className="capitalize text-blue-400 font-semibold">{selectedOrder.category || selectedOrder.productType || "N/A"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Customer User ID</span>
                <span className="font-mono text-gray-300 text-xs">{selectedOrder.userId || "N/A"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Total Price</span>
                <span className="font-bold text-green-400">{formatPrice(selectedOrder)}</span>
              </div>
              {selectedOrder.athleteName && (
                <div>
                  <span className="text-xs text-gray-400 block">Athlete</span>
                  <span className="text-purple-300">{selectedOrder.athleteName}</span>
                </div>
              )}
              {selectedOrder.eventDate && (
                <div>
                  <span className="text-xs text-gray-400 block">Event Date</span>
                  <span className="text-gray-300">{selectedOrder.eventDate}</span>
                </div>
              )}
              {selectedOrder.paymentMethod && (
                <div>
                  <span className="text-xs text-gray-400 block">Payment Method</span>
                  <span className="text-gray-300 uppercase">{selectedOrder.paymentMethod}</span>
                </div>
              )}
              {selectedOrder.qrToken && (
                <div className="col-span-2">
                  <span className="text-xs text-gray-400 block">QR Token</span>
                  <span className="font-mono text-xs text-gray-400 select-all bg-[#161b22] px-2 py-1 rounded border border-gray-700 block mt-1">
                    {selectedOrder.qrToken}
                  </span>
                </div>
              )}
            </div>

            {/* Editable Form Controls */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white border-b border-[#21262d] pb-2">Update Order Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Order Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="completed">Completed</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Delivery Status (Physical Items)</label>
                  <select
                    value={editDeliveryStatus}
                    onChange={(e) => setEditDeliveryStatus(e.target.value)}
                    className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">None / Not Applicable</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Tracking Number / Shipping Reference</label>
                <input
                  type="text"
                  placeholder="e.g. AWB123456789"
                  value={editTrackingNumber}
                  onChange={(e) => setEditTrackingNumber(e.target.value)}
                  className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {(selectedOrder.category === "events" || selectedOrder.category === "experiences") && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="checkedIn"
                    checked={editCheckedIn}
                    onChange={(e) => setEditCheckedIn(e.target.checked)}
                    className="rounded bg-[#0d1117] border-gray-700 text-blue-600"
                  />
                  <label htmlFor="checkedIn" className="text-sm text-gray-300 cursor-pointer">
                    Mark Customer as Checked-In for Event
                  </label>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
                <textarea
                  rows={3}
                  placeholder="Internal notes about this order..."
                  value={editAdminNotes}
                  onChange={(e) => setEditAdminNotes(e.target.value)}
                  className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-[#21262d]">
              <button
                onClick={handleSaveChanges}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded font-semibold text-sm transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => setSelectedOrder(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded font-semibold text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
