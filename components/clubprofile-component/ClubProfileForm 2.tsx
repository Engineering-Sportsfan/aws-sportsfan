"use client";

import axios from "axios";
import { ChangeEvent, useState } from "react";
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
  overviewCaptain: "",
  overviewCoach: "",
  overviewOwner: "",
  overviewVenue: "",
};

//  COMPONENT 

export default function ClubProfileForm({
  profileIdToEdit,
  initialForm = defaultProfileForm,
  initialAvatar = "",
  onSaved,
  onCancel,
}: Props) {
  const [form, setForm] = useState<ProfileForm>(initialForm);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

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
        res = await axios.put(`/api/club-profile/${profileIdToEdit}`, fd);
        onSaved(profileIdToEdit);
      } else {
        res = await axios.post("/api/club-profile", fd);
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

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
      {/* Basic Info */}
      <SectionTitle title="Basic Info" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Club / Team Name *"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="e.g. Royal Challengers Bengaluru"
        />
        <Input
          label="Team Code *"
          name="team"
          value={form.team}
          onChange={handleChange}
          placeholder="e.g. RCB"
        />
        <Input
          label="Type / Style"
          name="battingStyle"
          value={form.battingStyle}
          onChange={handleChange}
          placeholder="e.g. IPL Franchise"
        />
        <Input
          label="Est. / Founded"
          name="bowlingStyle"
          value={form.bowlingStyle}
          onChange={handleChange}
          placeholder="e.g. Est. 2008"
        />
      </div>

      <Divider />

      {/* About */}
      <SectionTitle title="About" />
      <Textarea
        label="About the Club"
        name="about"
        value={form.about}
        onChange={handleChange}
        placeholder="Write a brief description of the club..."
      />

      <Divider />

      {/* Avatar */}
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

      {/* Stats */}
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

      {/* Overview */}
      <SectionTitle title="Overview" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Captain"
          name="overviewCaptain"
          value={form.overviewCaptain}
          onChange={handleChange}
          placeholder="e.g. Virat Kohli"
        />
        <Input
          label="Coach"
          name="overviewCoach"
          value={form.overviewCoach}
          onChange={handleChange}
          placeholder="e.g. Hershey"
        />
        <Input
          label="Owner"
          name="overviewOwner"
          value={form.overviewOwner}
          onChange={handleChange}
          placeholder="e.g. United Spirits"
        />
        <Input
          label="Home Venue"
          name="overviewVenue"
          value={form.overviewVenue}
          onChange={handleChange}
          placeholder="e.g. M. Chinnaswamy Stadium"
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