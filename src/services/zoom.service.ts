import axios from "axios";
import { ZoomMeetingInput } from "./demoPipelineService";

type ZoomMeetingResponse = {
  joinUrl: string | null;
  hostUrl: string | null;
  zoomMeetingId: string | null;
  raw: unknown;
};

export async function createZoomMeeting(
  input: ZoomMeetingInput,
  durationMinutes: number
): Promise<ZoomMeetingResponse> {
  const zoomToken = process.env.ZOOM_ACCESS_TOKEN;
  const zoomUserId = process.env.ZOOM_USER_ID || "me";

  if (!zoomToken) {
    return {
      joinUrl: null,
      hostUrl: null,
      zoomMeetingId: null,
      raw: { skipped: true, reason: "ZOOM_ACCESS_TOKEN not configured" },
    };
  }

  const response = await axios.post(
    `https://api.zoom.us/v2/users/${zoomUserId}/meetings`,
    {
      topic: input.topic,
      type: 2,
      start_time: input.startTime.toISOString(),
      duration: durationMinutes,
      settings: {
        join_before_host: false,
        waiting_room: true,
        mute_upon_entry: true,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${zoomToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    joinUrl: response.data?.join_url ?? null,
    hostUrl: response.data?.start_url ?? null,
    zoomMeetingId: response.data?.id ? String(response.data.id) : null,
    raw: response.data,
  };
}
