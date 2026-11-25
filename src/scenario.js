import scenario from '../data/scenario.json'
import siteData from '../data/sites.json'
import cameraData from '../data/cameras.json'
import frameAnnotations from '../data/demo_frame_annotations.json'
import siteGeometry from '../testsampledata/site_geometry.json'
export { sortTracks, observationsForSite, latest, pointFor, siteBounds, decisionPayload } from './selectors.mjs'

export const fallbackSites = siteData.sites
export const fallbackCameras = cameraData
export const demoFrame = frameAnnotations
export const demoZones = siteGeometry.zones
export const syntheticTracks = Object.entries(Object.groupBy(scenario.observations, observation => observation.track_id)).map(([track_id, observations]) => ({
  track_id, observations: [...observations].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
  risk: { score: observations.at(-1).class_name === 'bird' ? 18 : 100, level: observations.at(-1).class_name === 'bird' ? 'low' : 'critical', reasons: observations.at(-1).class_name === 'bird' ? ['bird classification', 'short observation window'] : ['drone classification', 'three minute dwell', 'restricted zone proximity'], recommended_actions: observations.at(-1).class_name === 'bird' ? ['preserve_evidence'] : ['notify_police', 'preserve_evidence', 'warn_staff', 'pause_zone'] },
}))
