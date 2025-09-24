"use server";

import {
  createVpmPlayerState,
  getVpmPlayerState,
  updateVpmPlayerState,
  createVpmKfState,
  getVpmKfState,
  updateVpmKfState,
  createVpmPlayerMap,
  getVpmPlayerMap,
  createVpmPlayerKf,
  getVpmPlayerKf,
  createVpmPlayerLatest,
  getVpmPlayerLatest,
  updateVpmPlayerLatest,
  createVpmModelMeta,
  getVpmModelMeta,
  getAllVpmModelMetas,
  updateVpmModelMeta,
  deleteVpmModelMeta,
  getPlayerRatingsList,
} from "@/db/queries/vpm-queries";
import { getActiveSeason } from "@/db/queries/seasons-queries";
import {
  NewVpmPlayerState,
  NewVpmKfState,
  NewVpmPlayerMap,
  NewVpmPlayerKf,
  NewVpmPlayerLatest,
  NewVpmModelMeta,
} from "@/db/schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";
import { unstable_cache as cache } from "next/cache";

// VPM Player State Actions
export async function createVpmPlayerStateAction(
  data: NewVpmPlayerState
): Promise<ActionState> {
  try {
    const a = await createVpmPlayerState(data);
    return { status: "success", message: "VPM Player State created", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to create VPM Player State" };
  }
}

export async function getVpmPlayerStateAction(
  playerId: number
): Promise<ActionState> {
  try {
    const a = await getVpmPlayerState(playerId);
    return {
      status: "success",
      message: "VPM Player State retrieved",
      data: a,
    };
  } catch (error) {
    return { status: "error", message: "Failed to retrieve VPM Player State" };
  }
}

export async function updateVpmPlayerStateAction(
  playerId: number,
  data: Partial<NewVpmPlayerState>
): Promise<ActionState> {
  try {
    const a = await updateVpmPlayerState(playerId, data);
    return { status: "success", message: "VPM Player State updated", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to update VPM Player State" };
  }
}

// VPM KF State Actions
export async function createVpmKfStateAction(
  data: NewVpmKfState
): Promise<ActionState> {
  try {
    const a = await createVpmKfState(data);
    return { status: "success", message: "VPM KF State created", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to create VPM KF State" };
  }
}

export async function getVpmKfStateAction(
  playerId: number
): Promise<ActionState> {
  try {
    const a = await getVpmKfState(playerId);
    return { status: "success", message: "VPM KF State retrieved", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to retrieve VPM KF State" };
  }
}

export async function updateVpmKfStateAction(
  playerId: number,
  data: Partial<NewVpmKfState>
): Promise<ActionState> {
  try {
    const a = await updateVpmKfState(playerId, data);
    return { status: "success", message: "VPM KF State updated", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to update VPM KF State" };
  }
}

// VPM Player Map Actions
export async function createVpmPlayerMapAction(
  data: NewVpmPlayerMap
): Promise<ActionState> {
  try {
    const a = await createVpmPlayerMap(data);
    return { status: "success", message: "VPM Player Map created", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to create VPM Player Map" };
  }
}

export async function getVpmPlayerMapAction(
  playerId: number,
  mapId: number,
  modelVersion: string
): Promise<ActionState> {
  try {
    const a = await getVpmPlayerMap(playerId, mapId, modelVersion);
    return { status: "success", message: "VPM Player Map retrieved", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to retrieve VPM Player Map" };
  }
}

// VPM Player KF Actions
export async function createVpmPlayerKfAction(
  data: NewVpmPlayerKf
): Promise<ActionState> {
  try {
    const a = await createVpmPlayerKf(data);
    return { status: "success", message: "VPM Player KF created", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to create VPM Player KF" };
  }
}

export async function getVpmPlayerKfAction(
  playerId: number,
  gameNum: number,
  modelVersion: string
): Promise<ActionState> {
  try {
    const a = await getVpmPlayerKf(playerId, gameNum, modelVersion);
    return { status: "success", message: "VPM Player KF retrieved", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to retrieve VPM Player KF" };
  }
}

// VPM Player Latest Actions
export async function createVpmPlayerLatestAction(
  data: NewVpmPlayerLatest
): Promise<ActionState> {
  try {
    const a = await createVpmPlayerLatest(data);
    return { status: "success", message: "VPM Player Latest created", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to create VPM Player Latest" };
  }
}

export async function getVpmPlayerLatestAction(
  playerId: number
): Promise<ActionState> {
  try {
    const a = await getVpmPlayerLatest(playerId);
    return {
      status: "success",
      message: "VPM Player Latest retrieved",
      data: a,
    };
  } catch (error) {
    return { status: "error", message: "Failed to retrieve VPM Player Latest" };
  }
}

export async function updateVpmPlayerLatestAction(
  playerId: number,
  data: Partial<NewVpmPlayerLatest>
): Promise<ActionState> {
  try {
    const a = await updateVpmPlayerLatest(playerId, data);
    return {
      status: "success",
      message: "VPM Player Latest updated",
      data: a,
    };
  } catch (error) {
    return { status: "error", message: "Failed to update VPM Player Latest" };
  }
}

// VPM Model Meta Actions
export async function createVpmModelMetaAction(
  data: NewVpmModelMeta
): Promise<ActionState> {
  try {
    const a = await createVpmModelMeta(data);
    return { status: "success", message: "VPM Model Meta created", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to create VPM Model Meta" };
  }
}

export async function getVpmModelMetaAction(
  modelVersion: string
): Promise<ActionState> {
  try {
    const a = await getVpmModelMeta(modelVersion);
    return {
      status: "success",
      message: "VPM Model Meta retrieved",
      data: a,
    };
  } catch (error) {
    return { status: "error", message: "Failed to retrieve VPM Model Meta" };
  }
}

export async function getAllVpmModelMetasAction(): Promise<ActionState> {
  try {
    const a = await getAllVpmModelMetas();
    return {
      status: "success",
      message: "All VPM Model Metas retrieved",
      data: a,
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to retrieve all VPM Model Metas",
    };
  }
}

export async function updateVpmModelMetaAction(
  modelVersion: string,
  data: Partial<NewVpmModelMeta>
): Promise<ActionState> {
  try {
    const a = await updateVpmModelMeta(modelVersion, data);
    return { status: "success", message: "VPM Model Meta updated", data: a };
  } catch (error) {
    return { status: "error", message: "Failed to update VPM Model Meta" };
  }
}

export async function deleteVpmModelMetaAction(
  modelVersion: string
): Promise<ActionState> {
  try {
    await deleteVpmModelMeta(modelVersion);
    return { status: "success", message: "VPM Model Meta deleted" };
  } catch (error) {
    return { status: "error", message: "Failed to delete VPM Model Meta" };
  }
}

const getPlayerRatingsCached = cache(
  async (options: {
    minGames?: number;
    seasonStartDate?: Date;
    seasonEndDate?: Date | null;
  }) => {
    return getPlayerRatingsList(options);
  },
  ["player-ratings-list"],
  {
    revalidate: 60 * 60, // 1 hour
  }
);

export async function getPlayerRatings(options: { minGames?: number }) {
  const activeSeason = await getActiveSeason();
  return getPlayerRatingsCached({
    minGames: options.minGames,
    seasonStartDate: activeSeason?.startDate,
    seasonEndDate: activeSeason?.endDate,
  });
}
