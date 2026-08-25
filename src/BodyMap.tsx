import type { MuscleGroup } from './lib/muscles';

/**
 * A stylised front/back figure. Built from simple primitives on a shared
 * coordinate grid rather than freehand paths, so the muscle blocks always line
 * up inside the silhouette. It's a glanceable summary, not an anatomy chart.
 *
 * Grid: viewBox 220 x 460, body centred on x = 110.
 */

type Shape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number };

type Region = Shape & { group: MuscleGroup };

const mirror = (shape: Shape): Shape =>
  shape.kind === 'ellipse' ? { ...shape, cx: 220 - shape.cx } : { ...shape, x: 220 - shape.x - shape.w };

/** Both sides of a symmetric muscle. */
function pair(group: MuscleGroup, shape: Shape): Region[] {
  return [
    { ...shape, group },
    { ...mirror(shape), group }
  ];
}

const silhouette: Shape[] = [
  { kind: 'ellipse', cx: 110, cy: 34, rx: 21, ry: 25 }, // head
  { kind: 'rect', x: 99, y: 52, w: 22, h: 26, r: 9 }, // neck
  { kind: 'rect', x: 70, y: 80, w: 80, h: 122, r: 22 }, // torso
  { kind: 'rect', x: 80, y: 190, w: 60, h: 46, r: 16 }, // pelvis
  { kind: 'rect', x: 57, y: 88, w: 27, h: 86, r: 13 }, // upper arm L
  { kind: 'rect', x: 136, y: 88, w: 27, h: 86, r: 13 }, // upper arm R
  { kind: 'rect', x: 51, y: 166, w: 23, h: 80, r: 11 }, // forearm L
  { kind: 'rect', x: 146, y: 166, w: 23, h: 80, r: 11 }, // forearm R
  { kind: 'ellipse', cx: 62, cy: 256, rx: 11, ry: 14 }, // hand L
  { kind: 'ellipse', cx: 158, cy: 256, rx: 11, ry: 14 }, // hand R
  { kind: 'rect', x: 79, y: 228, w: 29, h: 110, r: 14 }, // thigh L
  { kind: 'rect', x: 112, y: 228, w: 29, h: 110, r: 14 }, // thigh R
  { kind: 'rect', x: 84, y: 332, w: 21, h: 92, r: 10 }, // lower leg L
  { kind: 'rect', x: 115, y: 332, w: 21, h: 92, r: 10 }, // lower leg R
  { kind: 'ellipse', cx: 94, cy: 430, rx: 12, ry: 9 }, // foot L
  { kind: 'ellipse', cx: 126, cy: 430, rx: 12, ry: 9 } // foot R
];

const frontRegions: Region[] = [
  ...pair('shoulders', { kind: 'ellipse', cx: 71, cy: 100, rx: 14, ry: 15 }),
  ...pair('chest', { kind: 'rect', x: 85, y: 92, w: 23, h: 38, r: 9 }),
  { kind: 'rect', x: 92, y: 136, w: 36, h: 58, r: 10, group: 'abs' },
  ...pair('biceps', { kind: 'ellipse', cx: 70, cy: 134, rx: 11, ry: 24 }),
  ...pair('forearms', { kind: 'ellipse', cx: 62, cy: 200, rx: 9, ry: 28 }),
  ...pair('legs', { kind: 'rect', x: 84, y: 240, w: 21, h: 84, r: 10 }), // quads
  ...pair('legs', { kind: 'rect', x: 88, y: 342, w: 14, h: 68, r: 7 }) // shins
];

const backRegions: Region[] = [
  ...pair('shoulders', { kind: 'ellipse', cx: 71, cy: 100, rx: 14, ry: 15 }),
  { kind: 'rect', x: 87, y: 86, w: 46, h: 32, r: 11, group: 'back' }, // traps
  ...pair('back', { kind: 'rect', x: 84, y: 122, w: 24, h: 54, r: 10 }), // lats
  { kind: 'rect', x: 96, y: 178, w: 28, h: 20, r: 8, group: 'back' }, // lower back
  ...pair('triceps', { kind: 'ellipse', cx: 70, cy: 134, rx: 11, ry: 24 }),
  ...pair('forearms', { kind: 'ellipse', cx: 62, cy: 200, rx: 9, ry: 28 }),
  ...pair('glutes', { kind: 'ellipse', cx: 95, cy: 213, rx: 16, ry: 15 }),
  ...pair('legs', { kind: 'rect', x: 84, y: 238, w: 21, h: 80, r: 10 }), // hamstrings
  ...pair('legs', { kind: 'rect', x: 88, y: 340, w: 15, h: 62, r: 7 }) // calves
];

function renderShape(shape: Shape, props: Record<string, unknown>, key: string | number) {
  if (shape.kind === 'ellipse') {
    return <ellipse key={key} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...props} />;
  }
  return <rect key={key} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.r} {...props} />;
}

export function BodyFigure({
  side,
  fills,
  onSelect,
  selected
}: {
  side: 'front' | 'back';
  fills: Record<MuscleGroup, string>;
  onSelect?: (group: MuscleGroup) => void;
  selected?: MuscleGroup | null;
}) {
  const regions = side === 'front' ? frontRegions : backRegions;
  return (
    <svg className="body-figure" viewBox="0 0 220 460" role="img" aria-label={`${side} of body`}>
      <g className="body-base">{silhouette.map((shape, index) => renderShape(shape, {}, index))}</g>
      <g className="body-regions">
        {regions.map((region, index) =>
          renderShape(
            region,
            {
              fill: fills[region.group],
              className: `body-region ${selected === region.group ? 'selected' : ''} ${onSelect ? 'tappable' : ''}`,
              onClick: onSelect ? () => onSelect(region.group) : undefined
            },
            `${region.group}-${index}`
          )
        )}
      </g>
      <text className="body-side-label" x="110" y="454" textAnchor="middle">
        {side === 'front' ? 'FRONT' : 'BACK'}
      </text>
    </svg>
  );
}

/** Small single-muscle thumbnail for each summary row. */
export function MuscleThumb({ group, color }: { group: MuscleGroup; color: string }) {
  const backOnly: MuscleGroup[] = ['back', 'triceps', 'glutes'];
  const side = backOnly.includes(group) ? 'back' : 'front';
  const regions = (side === 'front' ? frontRegions : backRegions).filter((region) => region.group === group);
  return (
    <svg className="muscle-thumb" viewBox="0 0 220 460" aria-hidden="true">
      <g className="body-base">{silhouette.map((shape, index) => renderShape(shape, {}, index))}</g>
      <g>{regions.map((region, index) => renderShape(region, { fill: color }, index))}</g>
    </svg>
  );
}
