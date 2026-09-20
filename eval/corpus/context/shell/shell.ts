import { exec } from "node:child_process";
export function run(command: string) {
  exec(command);
}
