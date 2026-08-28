export interface ActorIdentity {
  id: string;
  displayName: string;
  role: "viewer" | "editor" | "admin";
}
