import type { Board, Card, CardKind, Choice, Fact, Area, Note, Phase, Status } from '../shared/model.ts';

/** Database rows to the shapes the page gets. `viewer` decides which cards are marked "mine". */
export type Row = Record<string, unknown>;

export function boardFromRow(r: Row): Board {
  return {
    slug: String(r.slug),
    title: String(r.title),
    topic: String(r.topic),
    question: String(r.question),
    choices: JSON.parse(String(r.choices)) as Choice[],
    facts: JSON.parse(String(r.facts)) as Fact[],
    twists: JSON.parse(String(r.twists)) as string[],
    phase: String(r.phase) as Phase,
    areas: JSON.parse(String(r.areas)) as Area[],
    rev: Number(r.rev),
    created: Number(r.created),
  };
}

export function cardFromRow(r: Row, viewer: string | null): Card {
  return {
    id: Number(r.id),
    parentId: r.parent_id == null ? null : Number(r.parent_id),
    kind: String(r.kind) as CardKind,
    period: r.period == null ? null : Number(r.period),
    nickname: String(r.display ?? r.nickname),
    mine: viewer != null && r.author === viewer,
    choice: String(r.choice),
    choiceOther: String(r.choice_other),
    areaOverride: r.area_override == null ? null : String(r.area_override),
    factRef: String(r.fact_ref),
    title: String(r.title),
    does: String(r.does),
    notice: String(r.notice),
    changed: String(r.changed),
    twist: String(r.twist),
    imageId: r.image_id == null ? null : String(r.image_id),
    status: r.status == null ? null : (String(r.status) as Status),
    statusNote: String(r.status_note),
    hidden: !!r.hidden,
    x: r.x == null ? null : Number(r.x),
    y: r.y == null ? null : Number(r.y),
    created: Number(r.created),
    updated: Number(r.updated),
  };
}

export function noteFromRow(r: Row, viewer: string | null): Note {
  return {
    id: Number(r.id),
    cardId: Number(r.card_id),
    period: r.period == null ? null : Number(r.period),
    nickname: String(r.display ?? r.nickname),
    mine: viewer != null && r.author === viewer,
    text: String(r.text),
    hidden: !!r.hidden,
    created: Number(r.created),
  };
}

