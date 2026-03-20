import "./setup.js";
import { describe, it, expect } from "vitest";
import { registerAgent } from "../src/modules/agents/agent.service.js";
import { setAgentParent, getSubordinates, getChainOfCommand, getHierarchyTree, promoteAgent } from "../src/modules/hierarchy/hierarchy.service.js";
import { assertAuthorized, AuthorizationError } from "../src/modules/hierarchy/authorization.js";
import { heartbeat } from "../src/modules/agents/agent.service.js";

describe("Hierarchy", () => {
  let cmdrId: string, supId: string, w1Id: string, w2Id: string;

  it("should register agents with hierarchy", () => {
    const cmdr = registerAgent({ name: "Cmdr", capabilities: ["all"], role: "commander" });
    cmdrId = cmdr.id;
    heartbeat(cmdrId);

    const sup = registerAgent({ name: "Sup", capabilities: ["review"], role: "supervisor", parentAgentId: cmdrId });
    supId = sup.id;
    heartbeat(supId);

    const w1 = registerAgent({ name: "W1", capabilities: ["code"], role: "worker", parentAgentId: supId });
    w1Id = w1.id;
    heartbeat(w1Id);

    const w2 = registerAgent({ name: "W2", capabilities: ["test"], role: "worker", parentAgentId: supId });
    w2Id = w2.id;
    heartbeat(w2Id);

    expect(cmdr.role).toBe("commander");
    expect(sup.authorityLevel).toBe(3);
    expect(w1.authorityLevel).toBe(1);
  });

  it("should get subordinates", () => {
    const subs = getSubordinates(cmdrId);
    expect(subs.length).toBe(3); // sup + w1 + w2
  });

  it("should get chain of command", () => {
    const chain = getChainOfCommand(w1Id);
    expect(chain.length).toBe(2); // sup → cmdr
    expect(chain[0].name).toBe("Sup");
    expect(chain[1].name).toBe("Cmdr");
  });

  it("should build hierarchy tree", () => {
    const tree = getHierarchyTree();
    expect(tree.length).toBe(1);
    expect(tree[0].role).toBe("commander");
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].children.length).toBe(2);
  });

  it("should enforce authorization", () => {
    // Commander can do anything
    expect(() => assertAuthorized({ actingAgentId: cmdrId, action: "create_task_toplevel" })).not.toThrow();
    // Worker cannot create top-level tasks
    expect(() => assertAuthorized({ actingAgentId: w1Id, action: "create_task_toplevel" })).toThrow(AuthorizationError);
    // Worker can send messages up
    expect(() => assertAuthorized({ actingAgentId: w1Id, action: "send_message_up" })).not.toThrow();
  });

  it("should prevent duplicate commander", () => {
    expect(() => registerAgent({ name: "Cmdr2", capabilities: [], role: "commander" })).toThrow(/already exists/);
  });
});
