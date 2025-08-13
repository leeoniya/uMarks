let { abs, sin, cos, pow, sqrt, acos, PI } = Math;

let rad = deg => (deg * PI) / 180;
let deg = rad => (rad * 180) / PI;
let safeAcos = x => x < -1 ? PI : x > 1 ? 0 : acos(x);
let sqrtAbs = x => sqrt(abs(x));
let chunk = (arr, size) =>
  arr.reduce((acc, _, i) => {
    i % size == 0 && acc.push(arr.slice(i, i + size));
    return acc;
  }, []);

let vectorAngle = ([ux, uy], [vx, vy]) => {
  let sign = ux * vy - uy * vx < 0 ? -1 : 1;
  let ua = sqrtAbs(ux * ux + uy * uy);
  let va = sqrtAbs(vx * vx + vy * vy);
  let dot = ux * vx + uy * vy;

  return sign * safeAcos(dot / (ua * va));
};

let reflect = (cx, cy, pcx, pcy) => [pcx == null ? cx : cx * 2 - pcx, pcy == null ? cy : cy * 2 - pcy];

let parser = new DOMParser();
let getBBox = path => {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" style="position: fixed; left: 100%; top: 100%; visibility: hidden;"><path d="${path}" /></svg>`;
  let el = parser.parseFromString(svg, "image/svg+xml").documentElement;
  document.body.appendChild(el);
  let bbox = el.firstChild.getBBox();
  el.remove();
  return bbox;
};

// https://www.w3.org/TR/SVG/implnote.html#ArcConversionCenterToEndpoint
// impl adapted and tweaked from
// https://github.com/zjffun/svg-arc-center-endpoint
// https://observablehq.com/@awhitty/svg-2-elliptical-arc-to-canvas-path2d
function endpointToCenter(x1, y1, rx, ry, rot, fa, fs, x2, y2) {
  let phi = rad(rot);

  let sinPhi = sin(phi);
  let cosPhi = cos(phi);

  // Step 1: simplify through translation/rotation
  let x1_ = ( cosPhi * (x1 - x2)) / 2 + (sinPhi * (y1 - y2)) / 2;
  let y1_ = (-sinPhi * (x1 - x2)) / 2 + (cosPhi * (y1 - y2)) / 2;
  let x1_p2 = pow(x1_, 2);
  let y1_p2 = pow(y1_, 2);

  // B.2.5. Correction of out-of-range radii
  {
    // Step 1: Ensure radii are non-zero
    // if (rx === 0 || ry === 0) {
    //     return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, theta: 0, dTheta: 0 };
    // }
    // Step 2: Ensure radii are positive
    rx = abs(rx);
    ry = abs(ry);
    // Step 3: Ensure radii are large enough
    let L = x1_p2 / pow(rx, 2) + y1_p2 / pow(ry, 2);

    if (L > 1) {
      rx = sqrtAbs(L) * rx;
      ry = sqrtAbs(L) * ry;
    }
  }

  // Step 2 + 3: compute center
  let rxp2 = pow(rx, 2);
  let ryp2 = pow(ry, 2);
  let sign = fa === fs ? -1 : 1;

  /**
   * `pow(sqrt(L) * rx, 2)` will less than `L * pow(rx, 2)` when we run B.2.5. Correction of out-of-range radii
   * so below value will be negative, we need use abs to fix it
   */
  let M = sqrtAbs(
    (rxp2 *  ryp2 - rxp2 * y1_p2 - ryp2 * x1_p2) /
    (rxp2 * y1_p2 + ryp2 * x1_p2)
  ) * sign;

  let cx_ = (M * ( rx * y1_)) / ry;
  let cy_ = (M * (-ry * x1_)) / rx;
  let cx = cosPhi * cx_ - sinPhi * cy_ + (x1 + x2) / 2;
  let cy = sinPhi * cx_ + cosPhi * cy_ + (y1 + y2) / 2;

  // Step 4: compute θ and dθ
  let _a = [
    ( x1_ - cx_) / rx,
    ( y1_ - cy_) / ry,
  ];
  let _b = [
    (-x1_ - cx_) / rx,
    (-y1_ - cy_) / ry,
  ];
  let theta  = deg(vectorAngle([1, 0], _a));
  let dTheta = deg(vectorAngle(_a, _b)) % 360;

  if (fs === 0 && dTheta > 0)
    dTheta -= 360;

  if (fs === 1 && dTheta < 0)
    dTheta += 360;

  return [
    cx,
    cy,
    rx,
    ry,
    phi,
    rad(theta),
    rad(theta + dTheta),
    dTheta < 0
  ];
}

// TODO:
// drawer accept a callback that reports bbox
// relative commands (test mixed)
// Path2D or ctx2d (w/z sub-paths)
// rotation? pass in along with coords + scale
// use isPointInPath hit testing, with on-demand Path2D on hover
// optimize circles, rects, triangle up/down, diamond, maybe plus, cross
// optimize poly with segment cache scaled up? point-in-polygon-hao

let M = 'moveTo';
let L = 'lineTo';
let Q = 'quadraticCurveTo';
let C = 'bezierCurveTo';

// xc, yc are centroid % location relative to bbox; by default center of bbox
function createPathDrawer(pathStr, xc = 0.5, yc = 0.5) {
  let bbox = getBBox(pathStr);
  let xo = -bbox.width  * xc;
  let yo = -bbox.height * yc;

  let call = (fn, ...args) => `c.${fn}(${args.map((a, i) => `${i % 2 == 0 ? `x` : `y`} + s * ${a + (i % 2 == 0 ? xo : yo)}`).join(',')})`;

  let cmds = pathStr.match(/[A-Z][^A-Z]*/g).flatMap(cmd => {
    let c = cmd[0];

    let numArgs = (
      c == 'V' || c == 'H'             ? 1 :
      c == 'M' || c == 'L' || c == 'T' ? 2 :
      c == 'Q' || c == 'S'             ? 4 :
      c == 'C'                         ? 6 :
      c == 'A'                         ? 7 :
      0
    );

    let args = cmd.slice(1).trim().split(/[ ,]/).filter(p => p !== '').map(Number);

    return args.length > 0 ? chunk(args, numArgs).map((a, i) => [(c == 'M' && i > 0 ? 'L' : c), ...a]) : [[c]];
  });

  let x = 0;
  let y = 0;

  // prev control point
  // C, S
  let _cx = null;
  let _cy = null;
  // Q, T
  let _qx = null;
  let _qy = null;

  // s (scale)
  let funcBody = [];

  for (let i = 0; i < cmds.length; i++) {
    let [type, ...p] = cmds[i];

    switch (type) {
      case 'T':
        [_qx, _qy] = reflect(x, y, _qx, _qy);
        funcBody.push(call(Q, _qx, _qy, x = p[0], y = p[1]));
        _cx = _cy = null;
        break;
      case 'S':
        [_cx, _cy] = reflect(x, y, _cx, _cy);
        funcBody.push(call(C, _cx, _cy, _cx = p[0], _cy = p[1], x = p[2], y = p[3]));
        _qx = _qy = null;
        break;
      case 'A':
        let p2 = endpointToCenter(x, y, ...p);
        x = p[5];
        y = p[6];
        funcBody.push(`c.ellipse(x + s * ${p2[0] + xo}, y + s * ${p2[1] + yo}, s * ${p2[2]}, s * ${p2[3]}, ${p2[4]}, ${p2[5]}, ${p2[6]}, ${p2[7]})`);
        break;
      case 'Z':
        funcBody.push(`c.closePath()`);
        break;
      default:
        funcBody.push(
          type == 'M' ? call(M, x = p[0], y = p[1]) :
          type == 'L' ? call(L, x = p[0], y = p[1]) :

          type == 'V' ? call(L, x,        y = p[0]) :
          type == 'H' ? call(L, x = p[0], y) :

          type == 'C' ? call(C, p[0], p[1], _cx = p[2], _cy = p[3], x = p[4], y = p[5]) :
          type == 'Q' ? call(Q,             _qx = p[0], _qy = p[1], x = p[2], y = p[3]) :

          ''
        );
    }

    if (type != 'C' && type != 'Q' && type != 'S' && type != 'T')
      _cx = _cy = _qx = _qy = null;
  }

  return new Function('c', 'x', 'y', 's', `x??=0;y??=0;s??=1;${funcBody.join(';')};`);
}

export { createPathDrawer };
