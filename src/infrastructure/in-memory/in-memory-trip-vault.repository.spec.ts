import { describeVaultRepository } from "../../test-support/vault-repository.contract";
import { InMemoryTripVaultRepository } from "./in-memory-trip-vault.repository";

describeVaultRepository("InMemoryTripVaultRepository", () => {
  const repo = new InMemoryTripVaultRepository();
  return { repo, addNote: (p, c) => repo.addNote(p, c), files: () => repo.paths(), folders: () => repo.folderPaths() };
});
