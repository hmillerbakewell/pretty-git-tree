import { type Choice, DIM_LABELS, type Dim, OPTIONS, type Settings, withSetting } from "../settings.ts";
import { RadioGroup } from "./radio-group.tsx";

const RATIO_ICON_PIXELS = 14;

function Swatch({ colours }: { colours: readonly string[] }) {
  return (
    <span class="swatch">
      {colours.map((colour) => (
        <i key={colour} style={{ background: colour }} />
      ))}
    </span>
  );
}

function RatioIcon({ ratio: [width, height] }: { ratio: readonly [number, number] }) {
  const longest = Math.max(width, height);
  return <span class="ratio" style={{ width: `${(width / longest) * RATIO_ICON_PIXELS}px`, height: `${(height / longest) * RATIO_ICON_PIXELS}px` }} />;
}

interface SegmentedProps<Value extends string> {
  readonly label: string;
  readonly options: readonly Choice<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly names?: Readonly<Partial<Record<Value, string>>>;
}

export function Segmented<Value extends string>({ label, options, value, onChange, names }: SegmentedProps<Value>) {
  return (
    <div class="control">
      <span class="label">{label}</span>
      <RadioGroup
        className="seg"
        label={label}
        selected={value}
        onSelect={onChange}
        options={options.map((choice) => ({
          value: choice.id,
          title: choice.label ?? choice.id,
          content: (
            <>
              {choice.swatch && <Swatch colours={choice.swatch} />}
              {choice.ratio && <RatioIcon ratio={choice.ratio} />}
              {names?.[choice.id] ?? choice.id}
            </>
          ),
        }))}
      />
    </div>
  );
}

export function DimControl<D extends Dim>({ dim, settings, onChange }: { dim: D; settings: Settings; onChange: (next: Settings) => void }) {
  return <Segmented label={DIM_LABELS[dim]} options={OPTIONS[dim]} value={settings[dim]} onChange={(value) => onChange(withSetting(settings, dim, value))} />;
}
