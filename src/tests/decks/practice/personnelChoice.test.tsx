import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChargeChip } from "../../../app/decks/practice/TurnCounters";
import { PersonnelChoicePanel } from "../../../app/decks/practice/PersonnelChoicePanel";
import { personnelCandidateGroups } from "../../../app/decks/practice/personnelChoice";
import type { LogCharge } from "../../../app/decks/practice/gameLog";
import {
  initialTableState,
  type CardInstance,
  type MissionSlot,
  type TableState,
} from "../../../app/decks/practice/tableReducer";

// The choice of personnel of Common Purpose (#1712): the chip's button and the picker.

const target = { entry: 0, move: 0, card: 0 };
const charge = (choiceTaken?: boolean): LogCharge => ({
  target,
  card: "Common Purpose",
  draw: false,
  cost: 1,
  source: {
    title: "Common Purpose",
    reason: "stop personnel: +1 counter per affiliation",
    choice: { label: "Stop personnel…", personnel: "stopAffiliations" },
  },
  ...(choiceTaken ? { choiceTaken } : {}),
});

const instance = (
  id: string,
  name: string,
  type = "personnel",
  affiliation = "",
): CardInstance => ({
  id,
  card: { name, originalName: name, type, affiliation },
  face: "up",
});

const emptySlot = (): MissionSlot =>
  ({
    mission: null,
    awayTeam: [],
    underMission: [],
    onMission: [],
    ships: [],
  }) as unknown as MissionSlot;

const table = (): TableState => {
  const ship = {
    ...instance("s1", "Defiant", "ship"),
    crew: [
      instance("p3", "Kira Nerys", "personnel", "Bajoran"),
      { ...instance("p4", "Worf", "personnel", "Klingon"), stopped: true },
    ],
  };
  const missions = [0, 1, 2, 3, 4].map(emptySlot);
  missions[0] = {
    ...missions[0],
    mission: instance("m1", "Earth", "mission"),
    awayTeam: [
      instance("p1", "Data", "personnel", "Federation"),
      instance("p2", "Riker", "personnel", "Federation"),
      instance("e1", "Tricorder", "equipment"),
    ],
  };
  missions[1] = {
    ...missions[1],
    mission: instance("m2", "Bilana System", "mission"),
    ships: [ship],
  };
  return {
    ...initialTableState,
    missions,
    brig: [instance("p5", "Garak", "personnel", "Cardassian")],
  };
};

describe("the choice of personnel in the charge row (#1712)", () => {
  it("opens the picker, and is disabled once taken", () => {
    const onChoosePersonnel = jest.fn();
    const { rerender } = render(
      <ChargeChip
        charges={[charge()]}
        onCorrect={jest.fn()}
        onRaiseLimit={jest.fn()}
        onChoosePersonnel={onChoosePersonnel}
      />,
    );
    fireEvent.click(screen.getByTestId("charge-choice"));
    expect(onChoosePersonnel).toHaveBeenCalledWith(target, "Common Purpose");
    rerender(
      <ChargeChip
        charges={[charge(true)]}
        onCorrect={jest.fn()}
        onRaiseLimit={jest.fn()}
        onChoosePersonnel={onChoosePersonnel}
      />,
    );
    expect(screen.getByTestId("charge-choice")).toBeDisabled();
    expect(screen.getByTestId("charge-choice")).toHaveAccessibleName(
      "Common Purpose: Stop personnel…, taken",
    );
  });
});

describe("the picker of personnel (#1712)", () => {
  it("lists the unstopped commanded personnel by place, never the brig, a stopped one or equipment", () => {
    const groups = personnelCandidateGroups(table());
    expect(groups.map((g) => [g.label, g.cards.map((c) => c.id)])).toEqual([
      ["Away team at Earth", ["p1", "p2"]],
      ["Crew of Defiant at Bilana System", ["p3"]],
    ]);
  });

  it("sums up the pick, confirms the chosen ids, and cancels with no call", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    render(
      <PersonnelChoicePanel
        title="Common Purpose"
        groups={personnelCandidateGroups(table())}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId("personnel-choice-summary")).toHaveTextContent(
      "0 personnel, 0 affiliations: +0",
    );
    const cards = screen.getAllByTestId("personnel-choice-card");
    expect(cards).toHaveLength(3);
    cards.forEach((c) => fireEvent.click(c));
    expect(screen.getByTestId("personnel-choice-summary")).toHaveTextContent(
      "3 personnel, 2 affiliations: +2",
    );
    fireEvent.click(cards[1]);
    expect(screen.getByTestId("personnel-choice-summary")).toHaveTextContent(
      "2 personnel, 2 affiliations: +2",
    );
    fireEvent.click(screen.getByTestId("personnel-choice-cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("personnel-choice-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(["p1", "p3"]);
  });
});
