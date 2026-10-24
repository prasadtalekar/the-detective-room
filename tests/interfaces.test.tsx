import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Notebook, AnswerForm } from "../src/App";
import { makeSession, releasePhase, type CasePack } from "../src/game";
import packs from "../private/case-packs.json";
const { submit } = vi.hoisted(() => ({
  submit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  submit,
}));
const pack = packs[0] as CasePack;
function session(phase = 0) {
  const s = releasePhase(makeSession(pack, 2, "host").public, pack, phase);
  s.phase = phase;
  s.status = "running";
  s.deadline = Date.now() + 300000;
  return s;
}
const act = async (task: () => Promise<unknown>) => {
  await task();
};
describe("player controls", () => {
  it("allows investigator drafts but reserves official submission for the captain", () => {
    render(
      <AnswerForm
        code="ABC234"
        session={session()}
        teamId="t1"
        captain={false}
        now={Date.now()}
        connected
        act={act}
      />,
    );
    expect(screen.getByLabelText("Which version was disclosed?")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Submit official response" }),
    ).toBeDisabled();
  });
  it("locks captain submission at the deadline and while paused or offline", () => {
    const s = session();
    const props = {
      code: "ABC234",
      teamId: "t1",
      captain: true,
      now: s.deadline + 1,
      connected: true,
      act,
    };
    const view = render(<AnswerForm {...props} session={s} />);
    expect(
      screen.getByRole("button", { name: "Submit official response" }),
    ).toBeDisabled();
    view.rerender(
      <AnswerForm
        {...props}
        now={Date.now()}
        session={{ ...s, status: "paused" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Submit official response" }),
    ).toBeDisabled();
    view.rerender(
      <AnswerForm {...props} now={Date.now()} connected={false} session={s} />,
    );
    expect(
      screen.getByRole("button", { name: "Submit official response" }),
    ).toBeDisabled();
  });
  it("submits phase answers, reasoning and current run as one official response", async () => {
    submit.mockClear();
    const s = session();
    s.run = 3;
    render(
      <AnswerForm
        code="ABC234"
        session={s}
        teamId="t1"
        captain
        now={Date.now()}
        connected
        act={act}
      />,
    );
    for (const key of pack.key[0]) {
      const question = pack.questions[0].find((q) => q.id === key.id)!;
      fireEvent.change(screen.getByLabelText(question.prompt), {
        target: { value: key.answer },
      });
    }
    fireEvent.change(
      screen.getByLabelText("Investigation rationale / evidence citations"),
      { target: { value: "E01 identifies version 7." } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Submit official response" }),
    );
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        "ABC234",
        "t1",
        0,
        expect.objectContaining({
          run: 3,
          explanation: "E01 identifies version 7.",
          answers: expect.objectContaining({ p0q1: "v7" }),
        }),
      ),
    );
  });
  it("restores an official timeline and permits accessible reorder without a mouse", () => {
    const s = session(3);
    const answers = Object.fromEntries(
      pack.key[3].map((k) => [k.id, k.answer]),
    );
    render(
      <AnswerForm
        code="ABC234"
        session={s}
        teamId="t1"
        captain
        now={Date.now()}
        connected
        act={act}
        existing={{ answers, explanation: "", run: 1, submittedAt: Date.now() }}
      />,
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("09:51");
    fireEvent.click(
      screen.getByRole("button", { name: "Move event 2 earlier" }),
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("10:07");
  });
});
it("preserves a shared notebook draft on revision conflict and supports explicit reload", async () => {
  const save = vi
    .fn()
    .mockRejectedValue(new Error("A teammate updated the notebook."));
  const view = render(
    <Notebook title="Shared notes" text="Original" revision={1} save={save} />,
  );
  fireEvent.change(screen.getByLabelText("Shared notes"), {
    target: { value: "My draft" },
  });
  view.rerender(
    <Notebook
      title="Shared notes"
      text="Teammate update"
      revision={2}
      save={save}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("My draft", 1));
  expect(screen.getByLabelText("Shared notes")).toHaveValue("My draft");
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("teammate updated"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload latest" }));
  expect(screen.getByLabelText("Shared notes")).toHaveValue("Teammate update");
});
