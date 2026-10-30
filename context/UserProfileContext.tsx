"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface UserProfile {
  actualUserId?: string;
  userId?: string;
  authUserId?: string;
  email?: string;
  username?: string;
  name?: string;
  avatarUrl?: string;
  avatar?: string;
  role?: string;
  coins?: number;
  points?: number;
  badge?: string;
  [key: string]: any;
}

export interface UserProfileContextType {
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  loading: boolean;
  refreshUserProfile?: () => Promise<void>;
}

const defaultContextValue: UserProfileContextType = {
  userProfile: null,
  setUserProfile: () => {},
  loading: false,
};

const UserProfileContext = createContext<UserProfileContextType>(defaultContextValue);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored =
          localStorage.getItem("sf_user_profile") ||
          localStorage.getItem("userProfile") ||
          localStorage.getItem("user");
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored =
          localStorage.getItem("sf_user_profile") ||
          localStorage.getItem("userProfile") ||
          localStorage.getItem("user");
        if (stored) {
          setUserProfile(JSON.parse(stored));
        }
      } catch {}
    }
  }, []);

  const refreshUserProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        if (data && (data.user || data.profile || data.userId)) {
          const profile = data.user || data.profile || data;
          setUserProfile(profile);
          try {
            localStorage.setItem("sf_user_profile", JSON.stringify(profile));
          } catch {}
        }
      }
    } catch (e) {
      console.warn("Failed to refresh user profile:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <UserProfileContext.Provider value={{ userProfile, setUserProfile, loading, refreshUserProfile }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextType {
  const context = useContext(UserProfileContext);
  const [localProfile, setLocalProfile] = useState<UserProfile | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored =
          localStorage.getItem("sf_user_profile") ||
          localStorage.getItem("userProfile") ||
          localStorage.getItem("user");
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return null;
  });

  if (!context || !context.userProfile) {
    return {
      userProfile: context?.userProfile || localProfile,
      setUserProfile: context?.setUserProfile || setLocalProfile,
      loading: context?.loading || false,
      refreshUserProfile: context?.refreshUserProfile,
    };
  }
  return context;
}

export default UserProfileContext;

