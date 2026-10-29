import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { isOneOf } from "../../core/index.ts";
import { track } from "../analytics.ts";
import { Masthead } from "../components/masthead.tsx";
import { DimControl, Segmented } from "../components/segmented.tsx";
import { type Prepared, prepare } from "../render.ts";
import { DEFAULTS, DIM_LABELS, DIMENSIONS, type Dim, type Settings, validSettings, variants } from "../settings.ts";
import { Card, HistoryCaption } from "./card.tsx";
import { useHashState, type ZooState } from "./hash-state.ts";
import { exampleHistories, type History, sampleHistories } from "./histories.ts";
import { Lightbox, nameForStats } from "./lightbox.tsx";

const EMPTY_PREPARED: Prepared = prepare({ commits: [], head: null }, {});

function useHistories() {
  const [examples, setExamples] = useState<History[]>([]);
  const [samples] = useState(() => (import.meta.env?.DEV ? sampleHistories() : []));
  useEffect(() => void exampleHistories().then(setExamples), []);
  const histories = useMemo(() => [...examples, ...samples], [examples, samples]);
  const preparedById = useMemo(() => new Map(histories.map((history) => [history.id, prepare(history.log, { repoName: history.name })])), [histories]);
  const preparedOf = (history: History) => preparedById.get(history.id) ?? EMPTY_PREPARED;
  return { histories, preparedOf };
}

type OpenHistory = (history: History, settings: Settings) => void;

interface ViewProps {
  readonly histories: readonly History[];
  readonly preparedOf: (history: History) => Prepared;
  readonly settings: Settings;
  readonly state: ZooState;
  readonly update: (changes: Partial<ZooState>) => void;
  readonly open: OpenHistory;
}

const ZOO_DIMENSIONS = DIMENSIONS.filter((dim) => dim !== "twists");

const comparedDim = (state: ZooState): Dim => (isOneOf(ZOO_DIMENSIONS, state.compare) ? state.compare : "theme");

function CompareHead({ histories, state, update, history }: ViewProps & { history: History }) {
  return (
    <div class="compare-head">
      <label>
        <span class="label">History</span>
        <select value={history.id} onChange={(event) => update({ repo: event.currentTarget.value })}>
          {histories.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span class="label">Compare across</span>
        <select value={comparedDim(state)} onChange={(event) => update({ compare: event.currentTarget.value })}>
          {ZOO_DIMENSIONS.map((dim) => (
            <option key={dim} value={dim}>
              {DIM_LABELS[dim]}
            </option>
          ))}
        </select>
      </label>
      <span class="dim">{history.description}</span>
    </div>
  );
}

function CompareView(props: ViewProps) {
  const { histories, preparedOf, settings, state, open } = props;
  const history = histories.find((candidate) => candidate.id === state.repo) ?? histories[0];
  if (!history) return null;
  const dim = comparedDim(state);
  return (
    <>
      <CompareHead {...props} history={history} />
      <div class="grid" style={{ "--min": "300px" }}>
        {variants(settings, dim).map((variant) => (
          <Card
            key={variant[dim]}
            history={history}
            prepared={preparedOf(history)}
            settings={variant}
            onOpen={() => open(history, variant)}
            caption={
              <div class="card-title">
                <strong>{variant[dim]}</strong>
              </div>
            }
          />
        ))}
      </div>
    </>
  );
}

function GalleryView({ histories, preparedOf, settings, open }: ViewProps) {
  return (
    <div class="grid" style={{ "--min": settings.format === "landscape" ? "420px" : "280px" }}>
      {histories.map((history) => (
        <Card
          key={history.id}
          history={history}
          prepared={preparedOf(history)}
          settings={settings}
          onOpen={() => open(history, settings)}
          caption={<HistoryCaption history={history} prepared={preparedOf(history)} />}
        />
      ))}
    </div>
  );
}

function SettingsToolbar({ settings, state, update }: Pick<ViewProps, "settings" | "state" | "update">) {
  const shownDims = ZOO_DIMENSIONS.filter((dim) => !(state.view === "compare" && dim === state.compare));
  return (
    <nav class="toolbar" aria-label="Settings">
      {shownDims.map((dim) => (
        <DimControl
          key={dim}
          dim={dim}
          settings={settings}
          onChange={(next) => {
            update({ [dim]: next[dim] });
            track("setting_changed", { view: "zoo", setting: dim, value: next[dim] });
          }}
        />
      ))}
    </nav>
  );
}

function useOpenHistory(histories: readonly History[]) {
  const [opened, setOpened] = useState<{ id: string; settings: Settings } | null>(null);
  const open: OpenHistory = (history, settings) => {
    setOpened({ id: history.id, settings });
    track("example_opened", { example: nameForStats(history), style: settings.style, theme: settings.theme, format: settings.format });
  };
  const step = useCallback(
    (delta: number) =>
      setOpened((current) => {
        const index = histories.findIndex((history) => history.id === current?.id);
        const next = histories[(index + delta + histories.length) % histories.length];
        return current && next ? { ...current, id: next.id } : current;
      }),
    [histories],
  );
  const history = opened && histories.find((candidate) => candidate.id === opened.id);
  return { opened: history && opened ? { history, settings: opened.settings } : null, open, step, close: () => setOpened(null) };
}

function ZooIntro({ state, update }: Pick<ViewProps, "state" | "update">) {
  return (
    <div class="zoo-intro">
      <div>
        <h1>Examples</h1>
        <p>
          A week or so of real open-source projects in early 2026, from one straight line to a merge queue. Change a setting above and every drawing follows;
          open one to download it.
        </p>
      </div>
      <Segmented label="View" options={[{ id: "gallery" }, { id: "compare" }]} value={state.view} onChange={(view) => update({ view })} />
    </div>
  );
}

export function Zoo() {
  const { histories, preparedOf } = useHistories();
  const [state, update] = useHashState({ ...DEFAULTS, view: "gallery", repo: "example:git", compare: "theme" });
  const settings = { ...validSettings(state), twists: DEFAULTS.twists };
  const { opened, open, step, close } = useOpenHistory(histories);
  const viewProps: ViewProps = { histories, preparedOf, settings, state, update, open };
  return (
    <>
      <Masthead>
        <a class="button primary" href="#make">
          Draw yours
        </a>
      </Masthead>
      <SettingsToolbar settings={settings} state={state} update={update} />
      <main class="zoo">
        <ZooIntro state={state} update={update} />
        {histories.length > 0 && (state.view === "compare" ? <CompareView {...viewProps} /> : <GalleryView {...viewProps} />)}
      </main>
      {opened && <Lightbox history={opened.history} prepared={preparedOf(opened.history)} settings={opened.settings} onClose={close} onStep={step} />}
    </>
  );
}
