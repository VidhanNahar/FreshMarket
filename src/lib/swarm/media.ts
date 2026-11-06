export { swarmReference } from "../../../shared/media";
import { resolveImageSource } from "../../../shared/media";
export function imageSource(value: string) {
  return resolveImageSource(value, process.env.NEXT_PUBLIC_SWARM_GATEWAY_URL);
}
