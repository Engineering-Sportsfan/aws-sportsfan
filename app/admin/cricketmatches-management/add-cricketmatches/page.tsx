import AddCricketMatchPage from "@/components/CricketMatches-Component/AdminUploadPanel";



export default function AddCricketMatchesPage() {
  return (
    <div className="min-h-screen bg-[#0a0c10] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Add New Match</h1>
        {/* The MatchForm component will handle both adding and editing matches */}
       <AddCricketMatchPage />
      </div>
    </div>
  );
}