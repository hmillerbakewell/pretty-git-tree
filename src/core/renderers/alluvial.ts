import { defineStyle } from "../style/renderer.ts";
import { channelsOf } from "./alluvial/channels.ts";
import { mergesByParent, planCourses } from "./alluvial/courses.ts";
import { carriedWeights } from "./alluvial/flow.ts";
import { markLayer, ribbonLayer } from "./alluvial/marks.ts";
import { laneRibbon, mergeThreads } from "./alluvial/ribbons.ts";

export const alluvial = defineStyle({
  name: "alluvial",
  description: "A Sankey diagram: ribbons as wide as the commits they carry, swelling at every merge.",
  tunes: ["arrange", "route"],
  showsGrid: true,

  draw({ graph, frame, theme, options, view }) {
    const carried = carriedWeights(graph, view);
    const channels = channelsOf(frame, view, options, carried);
    const merges = mergesByParent(view);
    const courses = planCourses(view, channels, carried, merges);
    const ribbons = [...view.lanes.flatMap((lane) => laneRibbon(lane, courses, channels) ?? []), ...mergeThreads(merges, courses, channels)];
    return { layers: [ribbonLayer(ribbons, theme, channels), markLayer(view, courses, channels, theme)] };
  },
});
