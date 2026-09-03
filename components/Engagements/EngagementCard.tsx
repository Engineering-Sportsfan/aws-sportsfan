"use client";

import React from "react";
import { EngagementItem } from "@/types/engagements";
import FanBattleCard from "./FanBattleCard";
import QuizCard from "./QuizCard";
import PollCard from "./PollCard";
import PredictionCard from "./PredictionCard";

interface Props {
  item: EngagementItem;
  onInteraction?: (data: any) => void;
}

export default function EngagementCard({ item, onInteraction }: Props) {
  if (item.type === "fan_battle") {
    return <FanBattleCard item={item} onVoteSuccess={onInteraction} />;
  }
  if (item.type === "quiz") {
    return <QuizCard item={item} onAnswerSuccess={onInteraction} />;
  }
  if (item.type === "poll") {
    return <PollCard item={item} onVoteSuccess={onInteraction} />;
  }
  if (item.type === "prediction") {
    return <PredictionCard item={item} onPredictionSuccess={onInteraction} />;
  }
  return null;
}
