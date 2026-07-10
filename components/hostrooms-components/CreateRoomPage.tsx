"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CreateRoomStep1 from "./Step1form";
import CreateRoomStep2 from "./Step2form";
import CreateRoomStep3 from "./Step3form";
import CreateRoomStep4 from "./Step4form";
// REMOVED: import { getAuth } from "firebase-admin/auth";

interface Step1Data {
  eventId?: string;
  eventName: string;
  roomType: string;
}

export default function CreateRoomFlow({ editId }: { editId?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [roomId, setRoomId] = useState<string | null>(editId || null);
  // const [isEditMode, setIsEditMode] = useState(!!editId);

  // If in edit mode, fetch and populate data
  useEffect(() => {
    if (editId) {
      setRoomId(editId);
      // Step will be determined by which data exists
      // You can fetch the current step from the room data
    }
  }, [editId]);

  const getToken = async (): Promise<string> => {
    // TODO: Implement client-side token fetching (e.g. next-auth getSession).
    // The previous implementation used firebase-admin which broke the build.
    return "dummy-token";
  };

  const handleStep1Next = async (data: Step1Data) => {
    try {
      const formData = new FormData();
      formData.append("eventId", data.eventId || `evt-${Date.now()}`);
      formData.append("eventName", data.eventName);
      formData.append("roomType", data.roomType);

      const token = await getToken();
      
      // If in edit mode, use PUT to update
      const url = roomId ? `/api/hostrooms/${roomId}` : "/api/hostrooms";
      const method = roomId ? "PUT" : "POST";

      const response = await fetch(url, {
        method: method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        if (!roomId) setRoomId(result.roomId);
        setStep(2);
      } else {
        alert("Failed to save: " + result.error);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred");
    }
  };

  const handleStep2Next = async (formData: FormData) => {
    try {
      if (!roomId) throw new Error("No room ID");
      
      const token = await getToken();
      const response = await fetch(`/api/hostrooms/${roomId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setStep(3);
      } else {
        alert("Failed to save details: " + result.error);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred");
    }
  };

  const handleStep3Next = async (formData: FormData) => {
    try {
      if (!roomId) throw new Error("No room ID");
      
      const token = await getToken();
      const response = await fetch(`/api/hostrooms/${roomId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setStep(4);
      } else {
        alert("Failed to save content: " + result.error);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred");
    }
  };

  const handleStep4Next = async (formData: FormData) => {
    try {
      if (!roomId) throw new Error("No room ID");
      
      const token = await getToken();
      const response = await fetch(`/api/hostrooms/${roomId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        router.push(`/admin/hostroom-management/hostroom-list`);
      } else {
        alert("Failed to publish: " + result.error);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred");
    }
  };

  return (
    <>
      {step === 1 && (
        <CreateRoomStep1 
          editId={editId}
          onNext={handleStep1Next} 
        />
      )}
      {step === 2 && (
        <CreateRoomStep2 
          roomId={roomId!} 
          editId={editId}
          onNext={handleStep2Next} 
          onPrev={() => setStep(1)} 
        />
      )}
      {step === 3 && (
        <CreateRoomStep3 
          roomId={roomId!} 
          editId={editId}
          onNext={handleStep3Next} 
          onPrev={() => setStep(2)} 
        />
      )}
      {step === 4 && (
        <CreateRoomStep4 
          roomId={roomId!} 
          editId={editId}
          onNext={handleStep4Next} 
          onPrev={() => setStep(3)} 
        />
      )}
    </>
  );
}