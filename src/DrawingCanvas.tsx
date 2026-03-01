import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'

type Point = {
  x: number
  y: number
}

type Shape = {
  points: Point[]
  color: string
  name: string
  showName: boolean
  measurements: ShapeMeasurement[]
}

type ShapeMeasurement = {
  segmentStartIndex: number
  value: string
}

type PointTarget = {
  shapeIndex: number | null
  pointIndex: number
}

type MidpointTarget = {
  shapeIndex: number
  segmentStartIndex: number
  midpoint: Point
}

type ActiveMeasurementInput = {
  shapeIndex: number
  segmentStartIndex: number
  midpoint: Point
  value: string
}

type MeasurementTarget = {
  shapeIndex: number
  segmentStartIndex: number
}

type SideDragTarget = {
  shapeIndex: number
  segmentStartIndex: number
}

const STANDARD_COLORS = [
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#64748b',
]

const START_COLOR = '#3b82f6'
const POINT_RADIUS = 4
const CLOSE_DISTANCE = 10
const CLOSE_INDICATOR_COLOR = '#16a34a'
const LABEL_HOVER_RADIUS = 14
const LABEL_CIRCLE_RADIUS = 12
const MIDPOINT_HOVER_DISTANCE = 12
const MIDPOINT_INDICATOR_RADIUS = 10
const SEGMENT_MEASUREMENT_OFFSET = 20
const SEGMENT_MEASUREMENT_INSIDE_OFFSET = 16
const LEADER_LINE_LABEL_GAP = 5
const LEADER_LINE_POINT_GAP = POINT_RADIUS + 3
const MEASURED_SIDE_HOVER_DISTANCE = 3
const GRID_SPACING_OPTIONS = [16, 32, 64]

const getSegmentOutsideLabelPosition = (points: Point[], segmentStartIndex: number): Point | null => {
  if (points.length < 2) {
    return null
  }

  const start = points[segmentStartIndex]
  const end = points[(segmentStartIndex + 1) % points.length]
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }

  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)

  if (length < 1e-6) {
    return midpoint
  }

  const normalA = {
    x: -dy / length,
    y: dx / length,
  }
  const normalB = {
    x: -normalA.x,
    y: -normalA.y,
  }

  const candidateA = {
    x: midpoint.x + normalA.x * SEGMENT_MEASUREMENT_OFFSET,
    y: midpoint.y + normalA.y * SEGMENT_MEASUREMENT_OFFSET,
  }
  const candidateB = {
    x: midpoint.x + normalB.x * SEGMENT_MEASUREMENT_OFFSET,
    y: midpoint.y + normalB.y * SEGMENT_MEASUREMENT_OFFSET,
  }

  const candidateAInside = isPointInsidePolygon(candidateA, points)
  const candidateBInside = isPointInsidePolygon(candidateB, points)

  if (candidateAInside !== candidateBInside) {
    return candidateAInside ? candidateB : candidateA
  }

  const centroid = getPolygonCentroid(points)
  const candidateADistance = Math.hypot(candidateA.x - centroid.x, candidateA.y - centroid.y)
  const candidateBDistance = Math.hypot(candidateB.x - centroid.x, candidateB.y - centroid.y)

  return candidateADistance >= candidateBDistance ? candidateA : candidateB
}

const getSegmentInsideLabelPosition = (points: Point[], segmentStartIndex: number): Point | null => {
  if (points.length < 2) {
    return null
  }

  const start = points[segmentStartIndex]
  const end = points[(segmentStartIndex + 1) % points.length]
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }

  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)

  if (length < 1e-6) {
    return midpoint
  }

  const normalA = {
    x: -dy / length,
    y: dx / length,
  }
  const normalB = {
    x: -normalA.x,
    y: -normalA.y,
  }

  const candidateA = {
    x: midpoint.x + normalA.x * SEGMENT_MEASUREMENT_INSIDE_OFFSET,
    y: midpoint.y + normalA.y * SEGMENT_MEASUREMENT_INSIDE_OFFSET,
  }
  const candidateB = {
    x: midpoint.x + normalB.x * SEGMENT_MEASUREMENT_INSIDE_OFFSET,
    y: midpoint.y + normalB.y * SEGMENT_MEASUREMENT_INSIDE_OFFSET,
  }

  const candidateAInside = isPointInsidePolygon(candidateA, points)
  const candidateBInside = isPointInsidePolygon(candidateB, points)

  if (candidateAInside !== candidateBInside) {
    return candidateAInside ? candidateA : candidateB
  }

  const centroid = getPolygonCentroid(points)
  const candidateADistance = Math.hypot(candidateA.x - centroid.x, candidateA.y - centroid.y)
  const candidateBDistance = Math.hypot(candidateB.x - centroid.x, candidateB.y - centroid.y)

  return candidateADistance <= candidateBDistance ? candidateA : candidateB
}

const getMeasurementLetter = (index: number): string => {
  let value = index + 1
  let letter = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    letter = String.fromCharCode(65 + remainder) + letter
    value = Math.floor((value - 1) / 26)
  }

  return letter
}

const isPointNearSegmentOutside = (
  point: Point,
  segmentStart: Point,
  segmentEnd: Point,
  outsidePoint: Point,
): boolean => {
  const midpoint = {
    x: (segmentStart.x + segmentEnd.x) / 2,
    y: (segmentStart.y + segmentEnd.y) / 2,
  }

  const segmentDx = segmentEnd.x - segmentStart.x
  const segmentDy = segmentEnd.y - segmentStart.y
  const segmentLength = Math.hypot(segmentDx, segmentDy)

  if (segmentLength < 1e-6) {
    return false
  }

  const tangent = {
    x: segmentDx / segmentLength,
    y: segmentDy / segmentLength,
  }

  const outsideVector = {
    x: outsidePoint.x - midpoint.x,
    y: outsidePoint.y - midpoint.y,
  }
  const outsideLength = Math.hypot(outsideVector.x, outsideVector.y)

  if (outsideLength < 1e-6) {
    return false
  }

  const outwardNormal = {
    x: outsideVector.x / outsideLength,
    y: outsideVector.y / outsideLength,
  }

  const relative = {
    x: point.x - midpoint.x,
    y: point.y - midpoint.y,
  }

  const alongSegment = relative.x * tangent.x + relative.y * tangent.y
  const outwardDistance = relative.x * outwardNormal.x + relative.y * outwardNormal.y

  const halfSegment = segmentLength / 2
  const alongPadding = 10
  const isAlignedWithSegment = Math.abs(alongSegment) <= halfSegment + alongPadding
  const isOnOutsideSide = outwardDistance >= 0
  const isCloseToOutside = outwardDistance <= MIDPOINT_HOVER_DISTANCE + 10

  return isAlignedWithSegment && isOnOutsideSide && isCloseToOutside
}

const drawRoundedRectPath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const clampedRadius = Math.max(0, Math.min(radius, width / 2, height / 2))

  context.beginPath()
  context.moveTo(x + clampedRadius, y)
  context.lineTo(x + width - clampedRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius)
  context.lineTo(x + width, y + height - clampedRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height)
  context.lineTo(x + clampedRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius)
  context.lineTo(x, y + clampedRadius)
  context.quadraticCurveTo(x, y, x + clampedRadius, y)
  context.closePath()
}

const getBoxEdgePointInDirection = (
  labelCenter: Point,
  boxWidth: number,
  boxHeight: number,
  direction: Point,
): Point => {
  const vectorLength = Math.hypot(direction.x, direction.y)

  if (vectorLength < 1e-6) {
    return labelCenter
  }

  const directionX = direction.x / vectorLength
  const directionY = direction.y / vectorLength
  const halfWidth = boxWidth / 2
  const halfHeight = boxHeight / 2

  const scaleToVerticalSide =
    Math.abs(directionX) > 1e-6 ? halfWidth / Math.abs(directionX) : Number.POSITIVE_INFINITY
  const scaleToHorizontalSide =
    Math.abs(directionY) > 1e-6 ? halfHeight / Math.abs(directionY) : Number.POSITIVE_INFINITY
  const scaleToEdge = Math.min(scaleToVerticalSide, scaleToHorizontalSide)

  return {
    x: labelCenter.x + directionX * scaleToEdge,
    y: labelCenter.y + directionY * scaleToEdge,
  }
}

const getParallelLeaderLinePoints = (
  labelCenter: Point,
  boxWidth: number,
  boxHeight: number,
  segmentStart: Point,
  segmentEnd: Point,
  targetEndpoint: Point,
  towardSegmentStart: boolean,
): { start: Point; end: Point } | null => {
  const tangentDirection = {
    x: segmentEnd.x - segmentStart.x,
    y: segmentEnd.y - segmentStart.y,
  }
  const tangentLength = Math.hypot(tangentDirection.x, tangentDirection.y)

  if (tangentLength < 1e-6) {
    return null
  }

  const unitTangent = {
    x: tangentDirection.x / tangentLength,
    y: tangentDirection.y / tangentLength,
  }
  const drawDirection = towardSegmentStart
    ? {
        x: -unitTangent.x,
        y: -unitTangent.y,
      }
    : unitTangent

  const segmentMidpoint = {
    x: (segmentStart.x + segmentEnd.x) / 2,
    y: (segmentStart.y + segmentEnd.y) / 2,
  }

  const normalA = {
    x: -unitTangent.y,
    y: unitTangent.x,
  }
  const normalB = {
    x: -normalA.x,
    y: -normalA.y,
  }
  const centerToLabel = {
    x: labelCenter.x - segmentMidpoint.x,
    y: labelCenter.y - segmentMidpoint.y,
  }
  const outwardNormal =
    centerToLabel.x * normalA.x + centerToLabel.y * normalA.y >= 0 ? normalA : normalB

  const boxEdgePoint = getBoxEdgePointInDirection(labelCenter, boxWidth, boxHeight, drawDirection)
  const start = {
    x: boxEdgePoint.x + drawDirection.x * LEADER_LINE_LABEL_GAP,
    y: boxEdgePoint.y + drawDirection.y * LEADER_LINE_LABEL_GAP,
  }

  const startNormalOffset =
    (start.x - segmentMidpoint.x) * outwardNormal.x + (start.y - segmentMidpoint.y) * outwardNormal.y
  const endpointTangentOffset =
    (targetEndpoint.x - segmentMidpoint.x) * unitTangent.x +
    (targetEndpoint.y - segmentMidpoint.y) * unitTangent.y
  const directionSign = towardSegmentStart ? -1 : 1
  const endTangentOffset = endpointTangentOffset - directionSign * LEADER_LINE_POINT_GAP
  const end = {
    x: segmentMidpoint.x + unitTangent.x * endTangentOffset + outwardNormal.x * startNormalOffset,
    y: segmentMidpoint.y + unitTangent.y * endTangentOffset + outwardNormal.y * startNormalOffset,
  }

  const projectedLength = (end.x - start.x) * drawDirection.x + (end.y - start.y) * drawDirection.y

  if (projectedLength <= 0) {
    return null
  }

  return { start, end }
}

const isSameMidpointTarget = (
  left:
    | {
        shapeIndex: number
        segmentStartIndex: number
      }
    | null,
  right:
    | {
        shapeIndex: number
        segmentStartIndex: number
      }
    | null,
) => {
  if (!left || !right) {
    return false
  }

  return left.shapeIndex === right.shapeIndex && left.segmentStartIndex === right.segmentStartIndex
}

const isSameMeasurementTarget = (
  left: MeasurementTarget | null,
  right: MeasurementTarget | null,
) => {
  if (!left || !right) {
    return false
  }

  return left.shapeIndex === right.shapeIndex && left.segmentStartIndex === right.segmentStartIndex
}

const isSameSideDragTarget = (left: SideDragTarget | null, right: SideDragTarget | null) => {
  if (!left || !right) {
    return false
  }

  return left.shapeIndex === right.shapeIndex && left.segmentStartIndex === right.segmentStartIndex
}

const isPointNearBetweenSideBand = (
  point: Point,
  segmentStart: Point,
  segmentEnd: Point,
  outsidePoint: Point,
  bandTolerance: number,
) => {
  const segmentVector = {
    x: segmentEnd.x - segmentStart.x,
    y: segmentEnd.y - segmentStart.y,
  }
  const segmentLength = Math.hypot(segmentVector.x, segmentVector.y)

  if (segmentLength < 1e-6) {
    return false
  }

  const tangent = {
    x: segmentVector.x / segmentLength,
    y: segmentVector.y / segmentLength,
  }
  const segmentMidpoint = {
    x: (segmentStart.x + segmentEnd.x) / 2,
    y: (segmentStart.y + segmentEnd.y) / 2,
  }
  const outsideVector = {
    x: outsidePoint.x - segmentMidpoint.x,
    y: outsidePoint.y - segmentMidpoint.y,
  }
  const outsideDistance = Math.hypot(outsideVector.x, outsideVector.y)

  if (outsideDistance < 1e-6) {
    return false
  }

  const outwardNormal = {
    x: outsideVector.x / outsideDistance,
    y: outsideVector.y / outsideDistance,
  }
  const relative = {
    x: point.x - segmentMidpoint.x,
    y: point.y - segmentMidpoint.y,
  }
  const alongSegment = relative.x * tangent.x + relative.y * tangent.y
  const outwardDistanceFromSegment = relative.x * outwardNormal.x + relative.y * outwardNormal.y

  const halfSegment = segmentLength / 2
  const isAlongSide = Math.abs(alongSegment) <= halfSegment + 8
  const middleBandDistance = outsideDistance / 2
  const isNearMiddleBand =
    Math.abs(outwardDistanceFromSegment - middleBandDistance) <= bandTolerance &&
    outwardDistanceFromSegment >= 0 &&
    outwardDistanceFromSegment <= outsideDistance

  return isAlongSide && isNearMiddleBand
}

const isPointOnSegment = (point: Point, segmentStart: Point, segmentEnd: Point) => {
  const crossProduct =
    (point.y - segmentStart.y) * (segmentEnd.x - segmentStart.x) -
    (point.x - segmentStart.x) * (segmentEnd.y - segmentStart.y)

  if (Math.abs(crossProduct) > 1e-6) {
    return false
  }

  const dotProduct =
    (point.x - segmentStart.x) * (segmentEnd.x - segmentStart.x) +
    (point.y - segmentStart.y) * (segmentEnd.y - segmentStart.y)

  if (dotProduct < 0) {
    return false
  }

  const squaredLength =
    (segmentEnd.x - segmentStart.x) * (segmentEnd.x - segmentStart.x) +
    (segmentEnd.y - segmentStart.y) * (segmentEnd.y - segmentStart.y)

  return dotProduct <= squaredLength
}

const isPointInsidePolygon = (point: Point, polygon: Point[]) => {
  if (polygon.length < 3) {
    return false
  }

  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]

    if (isPointOnSegment(point, previousPoint, currentPoint)) {
      return true
    }

    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

const getPolygonCentroid = (points: Point[]): Point => {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }

  if (points.length < 3) {
    const averageX = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const averageY = points.reduce((sum, point) => sum + point.y, 0) / points.length
    return { x: averageX, y: averageY }
  }

  let twiceArea = 0
  let centroidX = 0
  let centroidY = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const cross = current.x * next.y - next.x * current.y

    twiceArea += cross
    centroidX += (current.x + next.x) * cross
    centroidY += (current.y + next.y) * cross
  }

  if (Math.abs(twiceArea) < 1e-5) {
    const averageX = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const averageY = points.reduce((sum, point) => sum + point.y, 0) / points.length
    return { x: averageX, y: averageY }
  }

  return {
    x: centroidX / (3 * twiceArea),
    y: centroidY / (3 * twiceArea),
  }
}

const getHorizontalLineIntersections = (polygon: Point[], y: number): number[] => {
  const intersections: number[] = []

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const crossesLine = (start.y <= y && end.y > y) || (end.y <= y && start.y > y)

    if (!crossesLine) {
      continue
    }

    const x = start.x + ((y - start.y) * (end.x - start.x)) / (end.y - start.y)
    intersections.push(x)
  }

  return intersections.sort((a, b) => a - b)
}

type ScanlineInterval = {
  y: number
  startX: number
  endX: number
  width: number
}

const getScanlineIntervals = (points: Point[]): ScanlineInterval[] => {
  if (points.length < 3) {
    return []
  }

  let minY = points[0].y
  let maxY = points[0].y

  points.forEach((point) => {
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  })

  const intervals: ScanlineInterval[] = []
  const startY = Math.ceil(minY)
  const endY = Math.floor(maxY)

  for (let y = startY; y <= endY; y += 1) {
    const scanY = y + 0.5

    if (scanY <= minY || scanY >= maxY) {
      continue
    }

    const intersections = getHorizontalLineIntersections(points, scanY)

    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const startX = intersections[index]
      const endX = intersections[index + 1]
      const width = endX - startX

      if (width <= 0) {
        continue
      }

      intervals.push({
        y: scanY,
        startX,
        endX,
        width,
      })
    }
  }

  return intervals
}

const getLargestSectionCenter = (points: Point[]): Point | null => {
  const intervals = getScanlineIntervals(points)

  if (intervals.length === 0) {
    return null
  }

  const anchor = intervals.reduce((widest, interval) =>
    interval.width > widest.width ? interval : widest,
  )

  const widthThreshold = anchor.width * 0.78
  const overlapThreshold = anchor.width * 0.52

  const nearbyIntervals = intervals
    .filter((interval) => {
      if (interval.width < widthThreshold) {
        return false
      }

      const overlapStart = Math.max(interval.startX, anchor.startX)
      const overlapEnd = Math.min(interval.endX, anchor.endX)
      const overlapWidth = overlapEnd - overlapStart

      return overlapWidth >= overlapThreshold
    })
    .sort((left, right) => left.y - right.y)

  if (nearbyIntervals.length === 0) {
    return {
      x: (anchor.startX + anchor.endX) / 2,
      y: anchor.y,
    }
  }

  let bestBand: ScanlineInterval[] = []
  let currentBand: ScanlineInterval[] = []

  nearbyIntervals.forEach((interval) => {
    if (currentBand.length === 0) {
      currentBand = [interval]
      return
    }

    const previous = currentBand[currentBand.length - 1]
    const isAdjacentRow = Math.abs(interval.y - previous.y - 1) < 0.001

    if (isAdjacentRow) {
      currentBand.push(interval)
      return
    }

    if (currentBand.length > bestBand.length) {
      bestBand = currentBand
    }

    currentBand = [interval]
  })

  if (currentBand.length > bestBand.length) {
    bestBand = currentBand
  }

  const targetBand = bestBand.length > 0 ? bestBand : [anchor]
  const centerRow = targetBand[Math.floor(targetBand.length / 2)]
  const center = {
    x: (centerRow.startX + centerRow.endX) / 2,
    y: centerRow.y,
  }

  if (isPointInsidePolygon(center, points)) {
    return center
  }

  return {
    x: (anchor.startX + anchor.endX) / 2,
    y: anchor.y,
  }
}

const getShapeLabelPosition = (points: Point[]): Point => {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }

  const centroid = getPolygonCentroid(points)

  if (isPointInsidePolygon(centroid, points)) {
    return centroid
  }

  const largestSectionCenter = getLargestSectionCenter(points)

  if (largestSectionCenter) {
    return largestSectionCenter
  }

  let minY = points[0].y
  let maxY = points[0].y

  points.forEach((point) => {
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  })

  const scanStartY = Math.max(minY + 0.5, Math.min(maxY - 0.5, centroid.y))
  const maxOffset = Math.ceil(maxY - minY)
  let bestCandidate: Point | null = null
  let bestSegmentWidth = -1
  let bestDistanceFromCentroid = Number.POSITIVE_INFINITY

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const scanLines = offset === 0 ? [scanStartY] : [scanStartY - offset, scanStartY + offset]

    for (const y of scanLines) {
      if (y <= minY || y >= maxY) {
        continue
      }

      const intersections = getHorizontalLineIntersections(points, y)

      for (let index = 0; index + 1 < intersections.length; index += 2) {
        const startX = intersections[index]
        const endX = intersections[index + 1]
        const segmentWidth = endX - startX

        if (segmentWidth <= 0) {
          continue
        }

        const candidate = {
          x: (startX + endX) / 2,
          y,
        }

        if (!isPointInsidePolygon(candidate, points)) {
          continue
        }

        const distanceFromCentroid =
          Math.abs(candidate.y - centroid.y) + Math.abs(candidate.x - centroid.x) * 0.05

        const isBetterWidth = segmentWidth > bestSegmentWidth
        const isSameWidthBetterDistance =
          Math.abs(segmentWidth - bestSegmentWidth) < 0.001 &&
          distanceFromCentroid < bestDistanceFromCentroid

        if (isBetterWidth || isSameWidthBetterDistance) {
          bestCandidate = candidate
          bestSegmentWidth = segmentWidth
          bestDistanceFromCentroid = distanceFromCentroid
        }
      }
    }

    if (bestCandidate) {
      return bestCandidate
    }
  }

  return points[0]
}

const getShapeBottomCenter = (points: Point[]): Point => {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }

  let minX = points[0].x
  let maxX = points[0].x
  let maxY = points[0].y

  points.forEach((point) => {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  })

  return {
    x: (minX + maxX) / 2,
    y: maxY + 20,
  }
}

const escapeSvgText = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

function DrawingCanvas() {
  const [shapes, setShapes] = useState<Shape[]>([])
  const [currentShapePoints, setCurrentShapePoints] = useState<Point[]>([])
  const [mousePosition, setMousePosition] = useState<Point | null>(null)
  const [hoveredPointTarget, setHoveredPointTarget] = useState<PointTarget | null>(null)
  const [draggingPointTarget, setDraggingPointTarget] = useState<PointTarget | null>(null)
  const [hoveredShapeBodyIndex, setHoveredShapeBodyIndex] = useState<number | null>(null)
  const [hoveredShapeLabelIndex, setHoveredShapeLabelIndex] = useState<number | null>(null)
  const [draggingShapeLabelIndex, setDraggingShapeLabelIndex] = useState<number | null>(null)
  const [draggingShapeBodyIndex, setDraggingShapeBodyIndex] = useState<number | null>(null)
  const [shapeDragLastMousePosition, setShapeDragLastMousePosition] = useState<Point | null>(null)
  const [hoveredMeasuredSideTarget, setHoveredMeasuredSideTarget] = useState<SideDragTarget | null>(null)
  const [draggingSideTarget, setDraggingSideTarget] = useState<SideDragTarget | null>(null)
  const [sideDragLastMousePosition, setSideDragLastMousePosition] = useState<Point | null>(null)
  const [hoveredMidpointTarget, setHoveredMidpointTarget] = useState<MidpointTarget | null>(null)
  const [hoveredMeasurementTarget, setHoveredMeasurementTarget] = useState<MeasurementTarget | null>(null)
  const [activeMeasurementInput, setActiveMeasurementInput] = useState<ActiveMeasurementInput | null>(null)
  const [selectedShapeIndex, setSelectedShapeIndex] = useState<number | null>(null)
  const [hoveredCoordinateIndex, setHoveredCoordinateIndex] = useState<number | null>(null)
  const [areShapeDetailsVisible, setAreShapeDetailsVisible] = useState(true)
  const [isGridEnabled, setIsGridEnabled] = useState(false)
  const [gridSettingIndex, setGridSettingIndex] = useState(1)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const measurementInputRef = useRef<HTMLInputElement>(null)
  const hasDraggedPointRef = useRef(false)

  const gridSpacing = GRID_SPACING_OPTIONS[gridSettingIndex]

  const getCanvasCoordinates = (event: MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current

    if (!canvas) {
      return null
    }

    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current

      if (!canvas) {
        return
      }

      const width = window.innerWidth
      const height = window.innerHeight
      const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1)
      const context = canvas.getContext('2d')

      if (!context) {
        return
      }

      canvas.width = Math.floor(width * devicePixelRatio)
      canvas.height = Math.floor(height * devicePixelRatio)
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      setCanvasSize({ width, height })
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  useEffect(() => {
    if (!activeMeasurementInput) {
      return
    }

    measurementInputRef.current?.focus()
    measurementInputRef.current?.select()
  }, [activeMeasurementInput?.shapeIndex, activeMeasurementInput?.segmentStartIndex])

  const closeCurrentShape = (points: Point[]) => {
    setShapes((previous) => [
      ...previous,
      { points, color: START_COLOR, name: '', showName: false, measurements: [] },
    ])
    setCurrentShapePoints([])
    setMousePosition(null)
    setHoveredPointTarget(null)
    setHoveredShapeBodyIndex(null)
    setDraggingPointTarget(null)
    setHoveredShapeLabelIndex(null)
    setDraggingShapeLabelIndex(null)
    setDraggingShapeBodyIndex(null)
    setShapeDragLastMousePosition(null)
    hasDraggedPointRef.current = false
  }

  const getDistance = (from: Point, to: Point) => {
    const dx = from.x - to.x
    const dy = from.y - to.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  const snapPointToGrid = (point: Point): Point => {
    if (!isGridEnabled) {
      return point
    }

    const snappedX = Math.round(point.x / gridSpacing) * gridSpacing
    const snappedY = Math.round(point.y / gridSpacing) * gridSpacing

    return {
      x: Math.max(0, Math.min(canvasSize.width, snappedX)),
      y: Math.max(0, Math.min(canvasSize.height, snappedY)),
    }
  }

  const findNearbyPoint = (point: Point): PointTarget | null => {
    for (let pointIndex = 0; pointIndex < currentShapePoints.length; pointIndex += 1) {
      if (getDistance(point, currentShapePoints[pointIndex]) <= CLOSE_DISTANCE) {
        return { shapeIndex: null, pointIndex }
      }
    }

    for (let shapeIndex = 0; shapeIndex < shapes.length; shapeIndex += 1) {
      const shape = shapes[shapeIndex]

      for (let pointIndex = 0; pointIndex < shape.points.length; pointIndex += 1) {
        if (getDistance(point, shape.points[pointIndex]) <= CLOSE_DISTANCE) {
          return { shapeIndex, pointIndex }
        }
      }
    }

    return null
  }

  const findNearbyShapeLabel = (point: Point): number | null => {
    for (let shapeIndex = 0; shapeIndex < shapes.length; shapeIndex += 1) {
      const labelPosition = getShapeLabelPosition(shapes[shapeIndex].points)

      if (getDistance(point, labelPosition) <= LABEL_HOVER_RADIUS) {
        return shapeIndex
      }
    }

    return null
  }

  const findNearbyLineMidpoint = (point: Point): MidpointTarget | null => {
    for (let shapeIndex = shapes.length - 1; shapeIndex >= 0; shapeIndex -= 1) {
      const shape = shapes[shapeIndex]

      if (shape.points.length < 2) {
        continue
      }

      for (let segmentStartIndex = 0; segmentStartIndex < shape.points.length; segmentStartIndex += 1) {
        const hasMeasurementValue = (shape.measurements ?? []).some(
          (measurement) =>
            measurement.segmentStartIndex === segmentStartIndex && measurement.value.trim().length > 0,
        )

        if (hasMeasurementValue) {
          continue
        }

        const start = shape.points[segmentStartIndex]
        const end = shape.points[(segmentStartIndex + 1) % shape.points.length]
        const midpoint = {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
        }
        const indicatorPoint = getSegmentOutsideLabelPosition(shape.points, segmentStartIndex) ?? midpoint

        const isNearOutsideSide = isPointNearSegmentOutside(point, start, end, indicatorPoint)

        if (isNearOutsideSide || getDistance(point, indicatorPoint) <= MIDPOINT_HOVER_DISTANCE) {
          return {
            shapeIndex,
            segmentStartIndex,
            midpoint: indicatorPoint,
          }
        }
      }
    }

    return null
  }

  const findNearbyMeasurementLabel = (point: Point): MeasurementTarget | null => {
    for (let shapeIndex = shapes.length - 1; shapeIndex >= 0; shapeIndex -= 1) {
      const shape = shapes[shapeIndex]
      const measurements = shape.measurements ?? []

      for (const measurement of measurements) {
        const measurementValue = measurement.value.trim()

        if (measurementValue.length === 0) {
          continue
        }

        const textPosition = getSegmentOutsideLabelPosition(shape.points, measurement.segmentStartIndex)

        if (!textPosition) {
          continue
        }

        const estimatedTextWidth = measurementValue.length * 7
        const boxWidth = estimatedTextWidth + 10
        const boxHeight = 18

        const withinX = point.x >= textPosition.x - boxWidth / 2 && point.x <= textPosition.x + boxWidth / 2
        const withinY =
          point.y >= textPosition.y - boxHeight / 2 && point.y <= textPosition.y + boxHeight / 2

        if (withinX && withinY) {
          return {
            shapeIndex,
            segmentStartIndex: measurement.segmentStartIndex,
          }
        }
      }
    }

    return null
  }

  const findNearbyMeasuredSide = (point: Point): SideDragTarget | null => {
    for (let shapeIndex = shapes.length - 1; shapeIndex >= 0; shapeIndex -= 1) {
      const shape = shapes[shapeIndex]
      const measurements = shape.measurements ?? []

      if (shape.points.length < 2 || measurements.length === 0) {
        continue
      }

      for (const measurement of measurements) {
        if (!measurement.value || measurement.value.trim().length === 0) {
          continue
        }

        const segmentStartIndex = measurement.segmentStartIndex
        const segmentStart = shape.points[segmentStartIndex]
        const segmentEnd = shape.points[(segmentStartIndex + 1) % shape.points.length]
        const segmentMidpoint = {
          x: (segmentStart.x + segmentEnd.x) / 2,
          y: (segmentStart.y + segmentEnd.y) / 2,
        }
        const outsidePoint =
          getSegmentOutsideLabelPosition(shape.points, segmentStartIndex) ?? segmentMidpoint
        const isNearBetweenBand = isPointNearBetweenSideBand(
          point,
          segmentStart,
          segmentEnd,
          outsidePoint,
          MEASURED_SIDE_HOVER_DISTANCE,
        )

        if (isNearBetweenBand) {
          return {
            shapeIndex,
            segmentStartIndex,
          }
        }
      }
    }

    return null
  }

  const updatePointByTarget = (target: PointTarget, point: Point) => {
    if (target.shapeIndex === null) {
      setCurrentShapePoints((previous) =>
        previous.map((existingPoint, index) => (index === target.pointIndex ? point : existingPoint)),
      )
      return
    }

    setShapes((previous) =>
      previous.map((shape, shapeIndex) => {
        if (shapeIndex !== target.shapeIndex) {
          return shape
        }

        return {
          ...shape,
          points: shape.points.map((existingPoint, pointIndex) =>
            pointIndex === target.pointIndex ? point : existingPoint,
          ),
        }
      }),
    )
  }

  const moveShapeByDelta = (shapeIndexToMove: number, deltaX: number, deltaY: number) => {
    setShapes((previous) =>
      previous.map((shape, shapeIndex) => {
        if (shapeIndex !== shapeIndexToMove) {
          return shape
        }

        return {
          ...shape,
          points: shape.points.map((shapePoint) => ({
            x: shapePoint.x + deltaX,
            y: shapePoint.y + deltaY,
          })),
        }
      }),
    )
  }

  const alignShapeToGrid = (shapeIndexToAlign: number) => {
    if (!isGridEnabled) {
      return
    }

    const shape = shapes[shapeIndexToAlign]

    if (!shape || shape.points.length === 0) {
      return
    }

    const anchorPoint = shape.points[0]
    const snappedAnchorPoint = snapPointToGrid(anchorPoint)
    const deltaX = snappedAnchorPoint.x - anchorPoint.x
    const deltaY = snappedAnchorPoint.y - anchorPoint.y

    if (deltaX === 0 && deltaY === 0) {
      return
    }

    moveShapeByDelta(shapeIndexToAlign, deltaX, deltaY)
  }

  const moveShapeSideByDelta = (target: SideDragTarget, delta: Point) => {
    setShapes((previous) =>
      previous.map((shape, shapeIndex) => {
        if (shapeIndex !== target.shapeIndex) {
          return shape
        }

        const segmentStart = shape.points[target.segmentStartIndex]
        const segmentEnd = shape.points[(target.segmentStartIndex + 1) % shape.points.length]
        const segmentVector = {
          x: segmentEnd.x - segmentStart.x,
          y: segmentEnd.y - segmentStart.y,
        }
        const segmentLength = Math.hypot(segmentVector.x, segmentVector.y)

        if (segmentLength < 1e-6) {
          return shape
        }

        const normal = {
          x: -segmentVector.y / segmentLength,
          y: segmentVector.x / segmentLength,
        }
        const distanceAlongNormal = delta.x * normal.x + delta.y * normal.y
        const offset = {
          x: normal.x * distanceAlongNormal,
          y: normal.y * distanceAlongNormal,
        }

        return {
          ...shape,
          points: shape.points.map((shapePoint, pointIndex) =>
            pointIndex === target.segmentStartIndex ||
            pointIndex === (target.segmentStartIndex + 1) % shape.points.length
              ? {
                  x: shapePoint.x + offset.x,
                  y: shapePoint.y + offset.y,
                }
              : shapePoint,
          ),
        }
      }),
    )
  }

  const updateShapeColor = (shapeIndexToUpdate: number, color: string) => {
    setShapes((previous) =>
      previous.map((shape, shapeIndex) =>
        shapeIndex === shapeIndexToUpdate
          ? {
              ...shape,
              color,
            }
          : shape,
      ),
    )
  }

  const updateShapeName = (shapeIndexToUpdate: number, name: string) => {
    setShapes((previous) =>
      previous.map((shape, shapeIndex) =>
        shapeIndex === shapeIndexToUpdate
          ? {
              ...shape,
              name,
            }
          : shape,
      ),
    )
  }

  const updateShapeNameVisibility = (shapeIndexToUpdate: number, showName: boolean) => {
    setShapes((previous) =>
      previous.map((shape, shapeIndex) =>
        shapeIndex === shapeIndexToUpdate
          ? {
              ...shape,
              showName,
            }
          : shape,
      ),
    )
  }

  const deleteShapeByIndex = (shapeIndexToDelete: number) => {
    setShapes((previous) => previous.filter((_, index) => index !== shapeIndexToDelete))
    setActiveMeasurementInput(null)
    setSelectedShapeIndex(null)
    setHoveredCoordinateIndex(null)
    setHoveredShapeLabelIndex(null)
    setHoveredMeasurementTarget(null)
    setDraggingShapeLabelIndex(null)
    setShapeDragLastMousePosition(null)
  }

  const deletePointByIndex = (shapeIndexToUpdate: number, pointIndexToDelete: number) => {
    setShapes((previous) => {
      const targetShape = previous[shapeIndexToUpdate]

      if (!targetShape || targetShape.points.length <= 3) {
        return previous
      }

      const nextShapes = previous
        .map((shape, shapeIndex) => {
          if (shapeIndex !== shapeIndexToUpdate) {
            return shape
          }

          return {
            ...shape,
            points: shape.points.filter((_, pointIndex) => pointIndex !== pointIndexToDelete),
            measurements: [],
          }
        })
        .filter((shape) => shape.points.length > 0)

      if (nextShapes.length === 0) {
        setSelectedShapeIndex(null)
      } else if (shapeIndexToUpdate >= nextShapes.length) {
        setSelectedShapeIndex(nextShapes.length - 1)
      }

      return nextShapes
    })

    if (activeMeasurementInput?.shapeIndex === shapeIndexToUpdate) {
      setActiveMeasurementInput(null)
    }

    setHoveredCoordinateIndex(null)
    setHoveredPointTarget(null)
  }

  const deleteMeasurementBySegment = (shapeIndexToUpdate: number, segmentStartIndexToDelete: number) => {
    setShapes((previous) =>
      previous.map((shape, shapeIndex) => {
        if (shapeIndex !== shapeIndexToUpdate) {
          return shape
        }

        return {
          ...shape,
          measurements: (shape.measurements ?? []).filter(
            (measurement) => measurement.segmentStartIndex !== segmentStartIndexToDelete,
          ),
        }
      }),
    )

    if (
      activeMeasurementInput?.shapeIndex === shapeIndexToUpdate &&
      activeMeasurementInput.segmentStartIndex === segmentStartIndexToDelete
    ) {
      setActiveMeasurementInput(null)
    }

    if (
      hoveredMeasurementTarget?.shapeIndex === shapeIndexToUpdate &&
      hoveredMeasurementTarget.segmentStartIndex === segmentStartIndexToDelete
    ) {
      setHoveredMeasurementTarget(null)
    }
  }

  const openMeasurementInput = (target: MidpointTarget) => {
    const shape = shapes[target.shapeIndex]
    const existingValue =
      shape?.measurements.find(
        (measurement) => measurement.segmentStartIndex === target.segmentStartIndex,
      )?.value ?? ''

    setActiveMeasurementInput({
      shapeIndex: target.shapeIndex,
      segmentStartIndex: target.segmentStartIndex,
      midpoint: target.midpoint,
      value: existingValue,
    })
  }

  const commitMeasurementInput = () => {
    if (!activeMeasurementInput) {
      return
    }

    const trimmedValue = activeMeasurementInput.value.trim()

    setShapes((previous) =>
      previous.map((shape, shapeIndex) => {
        if (shapeIndex !== activeMeasurementInput.shapeIndex) {
          return shape
        }

        const measurements = shape.measurements ?? []
        const measurementIndex = measurements.findIndex(
          (measurement) => measurement.segmentStartIndex === activeMeasurementInput.segmentStartIndex,
        )

        if (trimmedValue.length === 0) {
          if (measurementIndex === -1) {
            return shape
          }

          return {
            ...shape,
            measurements: measurements.filter((_, index) => index !== measurementIndex),
          }
        }

        if (measurementIndex === -1) {
          return {
            ...shape,
            measurements: [
              ...measurements,
              {
                segmentStartIndex: activeMeasurementInput.segmentStartIndex,
                value: trimmedValue,
              },
            ],
          }
        }

        return {
          ...shape,
          measurements: measurements.map((measurement, index) =>
            index === measurementIndex
              ? {
                  ...measurement,
                  value: trimmedValue,
                }
              : measurement,
          ),
        }
      }),
    )

    setActiveMeasurementInput(null)
  }

  const cancelMeasurementInput = () => {
    setActiveMeasurementInput(null)
  }

  const findShapeContainingPoint = (point: Point): number | null => {
    for (let index = shapes.length - 1; index >= 0; index -= 1) {
      if (isPointInsidePolygon(point, shapes[index].points)) {
        return index
      }
    }

    return null
  }

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (hasDraggedPointRef.current) {
      hasDraggedPointRef.current = false
      return
    }

    const point = getCanvasCoordinates(event)

    if (!point) {
      return
    }

    const snappedPoint = snapPointToGrid(point)

    const nearbyMeasurementTarget = findNearbyMeasurementLabel(snappedPoint)

    if (nearbyMeasurementTarget) {
      const shape = shapes[nearbyMeasurementTarget.shapeIndex]

      if (shape) {
        const measurementPosition =
          getSegmentOutsideLabelPosition(shape.points, nearbyMeasurementTarget.segmentStartIndex) ?? {
            x:
              (shape.points[nearbyMeasurementTarget.segmentStartIndex].x +
                shape.points[(nearbyMeasurementTarget.segmentStartIndex + 1) % shape.points.length].x) /
              2,
            y:
              (shape.points[nearbyMeasurementTarget.segmentStartIndex].y +
                shape.points[(nearbyMeasurementTarget.segmentStartIndex + 1) % shape.points.length].y) /
              2,
          }

        openMeasurementInput({
          shapeIndex: nearbyMeasurementTarget.shapeIndex,
          segmentStartIndex: nearbyMeasurementTarget.segmentStartIndex,
          midpoint: measurementPosition,
        })
      }

      setHoveredMeasurementTarget(nearbyMeasurementTarget)
      setSelectedShapeIndex(nearbyMeasurementTarget.shapeIndex)
      return
    }

    const nearbyMidpointTarget = findNearbyLineMidpoint(snappedPoint)

    if (nearbyMidpointTarget) {
      openMeasurementInput(nearbyMidpointTarget)
      setHoveredMidpointTarget(nearbyMidpointTarget)
      setSelectedShapeIndex(nearbyMidpointTarget.shapeIndex)
      return
    }

    const selectedShape = findShapeContainingPoint(snappedPoint)

    if (selectedShape !== null) {
      setSelectedShapeIndex(selectedShape)
      return
    }

    if (currentShapePoints.length >= 3) {
      const first = currentShapePoints[0]
      const distanceToStart = getDistance(snappedPoint, first)

      if (distanceToStart <= CLOSE_DISTANCE) {
        console.log('Current shape points:', currentShapePoints)
        closeCurrentShape(currentShapePoints)
        return
      }
    }

    const isInsideExistingShape = shapes.some((shape) => isPointInsidePolygon(snappedPoint, shape.points))

    if (isInsideExistingShape) {
      return
    }

    setSelectedShapeIndex(null)

    const updatedPoints = [...currentShapePoints, snappedPoint]
    console.log('Current shape points:', updatedPoints)
    setCurrentShapePoints(updatedPoints)
  }

  const handleCanvasMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasCoordinates(event)

    if (!point) {
      return
    }

    const interactionPoint = isGridEnabled ? snapPointToGrid(point) : point
    const nearbyMeasuredSide = findNearbyMeasuredSide(point)

    if (nearbyMeasuredSide) {
      setDraggingSideTarget(nearbyMeasuredSide)
      setSideDragLastMousePosition(point)
      setHoveredMeasuredSideTarget(nearbyMeasuredSide)
      hasDraggedPointRef.current = false
      return
    }

    const nearbyMeasurementTarget = findNearbyMeasurementLabel(interactionPoint)

    if (nearbyMeasurementTarget) {
      return
    }

    const nearbyPoint = findNearbyPoint(interactionPoint)

    if (nearbyPoint) {
      setDraggingPointTarget(nearbyPoint)
      hasDraggedPointRef.current = false
      return
    }

    const nearbyShapeLabelIndex = findNearbyShapeLabel(interactionPoint)

    if (nearbyShapeLabelIndex !== null) {
      alignShapeToGrid(nearbyShapeLabelIndex)
      setDraggingShapeLabelIndex(nearbyShapeLabelIndex)
      setDraggingShapeBodyIndex(null)
      setShapeDragLastMousePosition(isGridEnabled ? snapPointToGrid(point) : point)
      setHoveredShapeLabelIndex(nearbyShapeLabelIndex)
      hasDraggedPointRef.current = false
      return
    }

    const nearbyShapeBodyIndex = findShapeContainingPoint(interactionPoint)

    if (nearbyShapeBodyIndex !== null) {
      alignShapeToGrid(nearbyShapeBodyIndex)
      setDraggingShapeBodyIndex(nearbyShapeBodyIndex)
      setDraggingShapeLabelIndex(null)
      setShapeDragLastMousePosition(isGridEnabled ? snapPointToGrid(point) : point)
      setHoveredShapeBodyIndex(nearbyShapeBodyIndex)
      hasDraggedPointRef.current = false
    }
  }

  const handleCanvasMouseUp = () => {
    setDraggingPointTarget(null)
    setDraggingShapeLabelIndex(null)
    setDraggingShapeBodyIndex(null)
    setShapeDragLastMousePosition(null)
    setDraggingSideTarget(null)
    setSideDragLastMousePosition(null)
  }

  const handleCanvasMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasCoordinates(event)

    if (!point) {
      return
    }

    const interactionPoint = isGridEnabled ? snapPointToGrid(point) : point

    setMousePosition(interactionPoint)

    if (draggingSideTarget && sideDragLastMousePosition) {
      const delta = {
        x: point.x - sideDragLastMousePosition.x,
        y: point.y - sideDragLastMousePosition.y,
      }

      if (delta.x !== 0 || delta.y !== 0) {
        moveShapeSideByDelta(draggingSideTarget, delta)
        hasDraggedPointRef.current = true
      }

      setSideDragLastMousePosition(point)
      setHoveredMeasuredSideTarget(draggingSideTarget)
      setHoveredPointTarget(null)
      setHoveredShapeBodyIndex(null)
      setHoveredShapeLabelIndex(null)
      setHoveredMeasurementTarget(null)
      setHoveredMidpointTarget(null)
      return
    }

    if ((draggingShapeLabelIndex !== null || draggingShapeBodyIndex !== null) && shapeDragLastMousePosition) {
      const dragPoint = interactionPoint
      const deltaX = dragPoint.x - shapeDragLastMousePosition.x
      const deltaY = dragPoint.y - shapeDragLastMousePosition.y
      const shapeIndexToMove = draggingShapeLabelIndex ?? draggingShapeBodyIndex

      if ((deltaX !== 0 || deltaY !== 0) && shapeIndexToMove !== null) {
        moveShapeByDelta(shapeIndexToMove, deltaX, deltaY)
        hasDraggedPointRef.current = true
      }

      setShapeDragLastMousePosition(dragPoint)
      setHoveredShapeLabelIndex(draggingShapeLabelIndex)
      setHoveredShapeBodyIndex(draggingShapeBodyIndex)
      setHoveredPointTarget(null)
      setHoveredMidpointTarget(null)
      setHoveredMeasurementTarget(null)
      setHoveredMeasuredSideTarget(null)
      return
    }

    if (draggingPointTarget) {
      updatePointByTarget(draggingPointTarget, interactionPoint)
      setHoveredPointTarget(draggingPointTarget)
      setHoveredShapeBodyIndex(null)
      setHoveredShapeLabelIndex(null)
      setHoveredMidpointTarget(null)
      setHoveredMeasurementTarget(null)
      setHoveredMeasuredSideTarget(null)
      hasDraggedPointRef.current = true
      return
    }

    const nearbyPoint = findNearbyPoint(interactionPoint)
    setHoveredPointTarget(nearbyPoint)

    if (nearbyPoint) {
      setHoveredShapeBodyIndex(null)
      setHoveredShapeLabelIndex(null)
      setHoveredMidpointTarget(null)
      setHoveredMeasurementTarget(null)
      setHoveredMeasuredSideTarget(null)
      return
    }

    const nearbyShapeLabelIndex = findNearbyShapeLabel(interactionPoint)

    if (nearbyShapeLabelIndex !== null) {
      setHoveredShapeBodyIndex(null)
      setHoveredShapeLabelIndex(nearbyShapeLabelIndex)
      setHoveredPointTarget(null)
      setHoveredMidpointTarget(null)
      setHoveredMeasurementTarget(null)
      setHoveredMeasuredSideTarget(null)
      return
    }

    setHoveredShapeLabelIndex(null)

    const nearbyShapeBodyIndex = findShapeContainingPoint(interactionPoint)
    setHoveredShapeBodyIndex(nearbyShapeBodyIndex)

    if (nearbyShapeBodyIndex !== null) {
      setHoveredMeasurementTarget(null)
      setHoveredMeasuredSideTarget(null)
      setHoveredMidpointTarget(null)
      return
    }

    const nearbyMeasuredSide = findNearbyMeasuredSide(point)
    setHoveredMeasuredSideTarget(nearbyMeasuredSide)

    if (nearbyMeasuredSide) {
      setHoveredMeasurementTarget(null)
      setHoveredMidpointTarget(null)
      return
    }

    const nearbyMeasurementTarget = findNearbyMeasurementLabel(interactionPoint)
    setHoveredMeasurementTarget(nearbyMeasurementTarget)

    if (nearbyMeasurementTarget) {
      setHoveredMidpointTarget(null)
      return
    }

    const nearbyMidpointTarget = findNearbyLineMidpoint(interactionPoint)
    setHoveredMidpointTarget(nearbyMidpointTarget)

    if (nearbyMidpointTarget) {
      return
    }

    if (currentShapePoints.length >= 3) {
      const first = currentShapePoints[0]
      const distanceToStart = getDistance(interactionPoint, first)
      if (distanceToStart <= CLOSE_DISTANCE) {
        setHoveredPointTarget({ shapeIndex: null, pointIndex: 0 })
      }
      return
    }

    setHoveredMidpointTarget(null)
  }

  const handleCanvasMouseLeave = () => {
    setMousePosition(null)
    setHoveredPointTarget(null)
    setHoveredShapeBodyIndex(null)
    setHoveredMeasuredSideTarget(null)
    setHoveredMidpointTarget(null)
    setHoveredMeasurementTarget(null)
    setHoveredCoordinateIndex(null)
    setHoveredShapeLabelIndex(null)
    setDraggingPointTarget(null)
    setDraggingShapeLabelIndex(null)
    setDraggingShapeBodyIndex(null)
    setShapeDragLastMousePosition(null)
    setDraggingSideTarget(null)
    setSideDragLastMousePosition(null)
    hasDraggedPointRef.current = false
  }

  const handleMeasurementInputChange = (value: string) => {
    if (!activeMeasurementInput) {
      return
    }

    if (!/^[0-9.,\s\/xX×+-]*$/.test(value)) {
      return
    }

    if (/[a-wyzA-WYZ]/.test(value)) {
      return
    }

    setActiveMeasurementInput((previous) =>
      previous
        ? {
            ...previous,
            value,
          }
        : previous,
    )
  }

  const selectedShape = selectedShapeIndex !== null ? shapes[selectedShapeIndex] : null
  const highlightedCoordinateIndex =
    selectedShapeIndex !== null && hoveredPointTarget?.shapeIndex === selectedShapeIndex
      ? hoveredPointTarget.pointIndex
      : null
  const highlightedMeasurementSegmentStartIndex =
    selectedShapeIndex !== null && hoveredMeasurementTarget?.shapeIndex === selectedShapeIndex
      ? hoveredMeasurementTarget.segmentStartIndex
      : null

  const exportSelectedShapeAsSvg = () => {
    if (selectedShapeIndex === null) {
      return
    }

    const shape = shapes[selectedShapeIndex]

    if (!shape || shape.points.length === 0) {
      return
    }

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const includePointInBounds = (point: Point, radius = 0) => {
      minX = Math.min(minX, point.x - radius)
      minY = Math.min(minY, point.y - radius)
      maxX = Math.max(maxX, point.x + radius)
      maxY = Math.max(maxY, point.y + radius)
    }

    const shapeElements: string[] = []
    const color = shape.color

    const polygonPoints = shape.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
    shapeElements.push(
      `<polygon points="${polygonPoints}" fill="none" stroke="${color}" stroke-width="2" />`,
    )

    shape.points.forEach((point) => {
      includePointInBounds(point, 2)
    })

    if (areShapeDetailsVisible) {
      shape.points.forEach((point) => {
        shapeElements.push(
          `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${POINT_RADIUS}" fill="${color}" />`,
        )
        includePointInBounds(point, POINT_RADIUS + 2)
      })
    }

    const shapeLabelPosition = getShapeLabelPosition(shape.points)
    shapeElements.push(
      `<circle cx="${shapeLabelPosition.x.toFixed(2)}" cy="${shapeLabelPosition.y.toFixed(2)}" r="${LABEL_CIRCLE_RADIUS}" fill="#ffffff" stroke="${color}" stroke-width="2" />`,
    )
    shapeElements.push(
      `<text x="${shapeLabelPosition.x.toFixed(2)}" y="${(shapeLabelPosition.y + 1).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="16" font-weight="700" font-family="system-ui, sans-serif">${selectedShapeIndex + 1}</text>`,
    )
    includePointInBounds(shapeLabelPosition, LABEL_CIRCLE_RADIUS + 3)

    if (areShapeDetailsVisible) {
      const measurements = shape.measurements ?? []

      measurements.forEach((measurement, measurementIndex) => {
        const measurementValue = measurement.value.trim()

        if (measurementValue.length === 0) {
          return
        }

        const textPosition = getSegmentOutsideLabelPosition(shape.points, measurement.segmentStartIndex)

        if (!textPosition) {
          return
        }

        const boxWidth = measurementValue.length * 7 + 10
        const boxHeight = 18
        const segmentStartPoint = shape.points[measurement.segmentStartIndex]
        const segmentEndPoint = shape.points[(measurement.segmentStartIndex + 1) % shape.points.length]
        const lineToFirstPoint = getParallelLeaderLinePoints(
          textPosition,
          boxWidth,
          boxHeight,
          segmentStartPoint,
          segmentEndPoint,
          segmentStartPoint,
          true,
        )
        const lineToSecondPoint = getParallelLeaderLinePoints(
          textPosition,
          boxWidth,
          boxHeight,
          segmentStartPoint,
          segmentEndPoint,
          segmentEndPoint,
          false,
        )

        if (lineToFirstPoint) {
          shapeElements.push(
            `<line x1="${lineToFirstPoint.start.x.toFixed(2)}" y1="${lineToFirstPoint.start.y.toFixed(2)}" x2="${lineToFirstPoint.end.x.toFixed(2)}" y2="${lineToFirstPoint.end.y.toFixed(2)}" stroke="${color}" stroke-width="1" />`,
          )
          includePointInBounds(lineToFirstPoint.start, 1)
          includePointInBounds(lineToFirstPoint.end, 1)
        }

        if (lineToSecondPoint) {
          shapeElements.push(
            `<line x1="${lineToSecondPoint.start.x.toFixed(2)}" y1="${lineToSecondPoint.start.y.toFixed(2)}" x2="${lineToSecondPoint.end.x.toFixed(2)}" y2="${lineToSecondPoint.end.y.toFixed(2)}" stroke="${color}" stroke-width="1" />`,
          )
          includePointInBounds(lineToSecondPoint.start, 1)
          includePointInBounds(lineToSecondPoint.end, 1)
        }

        shapeElements.push(
          `<rect x="${(textPosition.x - boxWidth / 2).toFixed(2)}" y="${(textPosition.y - boxHeight / 2).toFixed(2)}" width="${boxWidth.toFixed(2)}" height="${boxHeight.toFixed(2)}" rx="6" ry="6" fill="rgba(255,255,255,0.95)" />`,
        )
        shapeElements.push(
          `<text x="${textPosition.x.toFixed(2)}" y="${textPosition.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="12" font-weight="600" font-family="system-ui, sans-serif">${escapeSvgText(measurementValue)}</text>`,
        )
        includePointInBounds({ x: textPosition.x - boxWidth / 2, y: textPosition.y - boxHeight / 2 })
        includePointInBounds({ x: textPosition.x + boxWidth / 2, y: textPosition.y + boxHeight / 2 })

        const insidePosition = getSegmentInsideLabelPosition(shape.points, measurement.segmentStartIndex)

        if (insidePosition) {
          shapeElements.push(
            `<text x="${insidePosition.x.toFixed(2)}" y="${insidePosition.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="11" font-weight="700" font-family="system-ui, sans-serif">${getMeasurementLetter(measurementIndex)}</text>`,
          )
          includePointInBounds(insidePosition, 8)
        }
      })
    }

    const shapeName = shape.name.trim()

    if (shapeName.length > 0) {
      const namePosition = getShapeBottomCenter(shape.points)
      const estimatedNameWidth = shapeName.length * 8
      shapeElements.push(
        `<text x="${namePosition.x.toFixed(2)}" y="${namePosition.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="14" font-weight="600" font-family="system-ui, sans-serif">${escapeSvgText(shapeName)}</text>`,
      )
      includePointInBounds(
        { x: namePosition.x - estimatedNameWidth / 2, y: namePosition.y - 9 },
        0,
      )
      includePointInBounds(
        { x: namePosition.x + estimatedNameWidth / 2, y: namePosition.y + 9 },
        0,
      )
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return
    }

    const padding = 12
    const viewBoxX = minX - padding
    const viewBoxY = minY - padding
    const viewBoxWidth = Math.max(1, maxX - minX + padding * 2)
    const viewBoxHeight = Math.max(1, maxY - minY + padding * 2)

    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX.toFixed(2)} ${viewBoxY.toFixed(2)} ${viewBoxWidth.toFixed(2)} ${viewBoxHeight.toFixed(2)}" width="${Math.ceil(viewBoxWidth)}" height="${Math.ceil(viewBoxHeight)}">${shapeElements.join('')}</svg>`
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = shapeName.length > 0 ? shapeName.replace(/[^a-z0-9-_]+/gi, '_') : `shape_${selectedShapeIndex + 1}`
    link.href = url
    link.download = `${safeName}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    context.clearRect(0, 0, canvasSize.width, canvasSize.height)

    if (isGridEnabled) {
      context.save()
      context.strokeStyle = '#e2e8f0'
      context.lineWidth = 1

      for (let x = 0; x <= canvasSize.width; x += gridSpacing) {
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, canvasSize.height)
        context.stroke()
      }

      for (let y = 0; y <= canvasSize.height; y += gridSpacing) {
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(canvasSize.width, y)
        context.stroke()
      }

      context.restore()
    }

    shapes.forEach((shape, index) => {
      const isSelectedShape = selectedShapeIndex === null || selectedShapeIndex === index
      const displayColor = isSelectedShape ? shape.color : '#cbd5e1'

      context.strokeStyle = displayColor
      context.lineWidth = 2

      if (shape.points.length > 1) {
        context.beginPath()
        context.moveTo(shape.points[0].x, shape.points[0].y)
        shape.points.slice(1).forEach((shapePoint) => {
          context.lineTo(shapePoint.x, shapePoint.y)
        })
        context.closePath()
        context.stroke()

        const activeMeasuredSideTarget = draggingSideTarget ?? hoveredMeasuredSideTarget
        const isThisShapeMeasuredSideActive = activeMeasuredSideTarget?.shapeIndex === index

        if (isThisShapeMeasuredSideActive) {
          const sideSegmentStartIndex = activeMeasuredSideTarget.segmentStartIndex
          const activeSegmentStartPoint = shape.points[sideSegmentStartIndex]
          const activeSegmentEndPoint = shape.points[(sideSegmentStartIndex + 1) % shape.points.length]

          context.strokeStyle = CLOSE_INDICATOR_COLOR
          context.lineWidth = 3
          context.beginPath()
          context.moveTo(activeSegmentStartPoint.x, activeSegmentStartPoint.y)
          context.lineTo(activeSegmentEndPoint.x, activeSegmentEndPoint.y)
          context.stroke()

          context.strokeStyle = displayColor
          context.lineWidth = 2
        }

        if (areShapeDetailsVisible) {
          const measurements = shape.measurements ?? []

          measurements.forEach((measurement, measurementIndex) => {
            const measurementValue = measurement.value

            if (!measurementValue) {
              return
            }

            const textPosition = getSegmentOutsideLabelPosition(shape.points, measurement.segmentStartIndex)

            if (!textPosition) {
              return
            }

            context.font = '600 12px system-ui, sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'

            const textMetrics = context.measureText(measurementValue)
            const textWidth = textMetrics.width
            const boxWidth = textWidth + 10
            const boxHeight = 18
            const segmentStartPoint = shape.points[measurement.segmentStartIndex]
            const segmentEndPoint = shape.points[(measurement.segmentStartIndex + 1) % shape.points.length]
            const lineToFirstPoint = getParallelLeaderLinePoints(
              textPosition,
              boxWidth,
              boxHeight,
              segmentStartPoint,
              segmentEndPoint,
              segmentStartPoint,
              true,
            )
            const lineToSecondPoint = getParallelLeaderLinePoints(
              textPosition,
              boxWidth,
              boxHeight,
              segmentStartPoint,
              segmentEndPoint,
              segmentEndPoint,
              false,
            )
            const isMeasurementHovered = isSameMeasurementTarget(hoveredMeasurementTarget, {
              shapeIndex: index,
              segmentStartIndex: measurement.segmentStartIndex,
            })
            const isMeasuredSideHovered = isSameSideDragTarget(
              draggingSideTarget ?? hoveredMeasuredSideTarget,
              {
                shapeIndex: index,
                segmentStartIndex: measurement.segmentStartIndex,
              },
            )
            const measurementTextColor = isMeasurementHovered
              ? CLOSE_INDICATOR_COLOR
              : isSelectedShape
                ? shape.color
                : '#64748b'
            const measurementLineColor = isMeasuredSideHovered
              ? CLOSE_INDICATOR_COLOR
              : measurementTextColor

            context.fillStyle = 'rgba(255, 255, 255, 0.95)'
            context.fillRect(
              textPosition.x - boxWidth / 2,
              textPosition.y - boxHeight / 2,
              boxWidth,
              boxHeight,
            )

            context.strokeStyle = measurementLineColor
            context.lineWidth = 1
            context.beginPath()

            if (lineToFirstPoint) {
              context.moveTo(lineToFirstPoint.start.x, lineToFirstPoint.start.y)
              context.lineTo(lineToFirstPoint.end.x, lineToFirstPoint.end.y)
            }

            if (lineToSecondPoint) {
              context.moveTo(lineToSecondPoint.start.x, lineToSecondPoint.start.y)
              context.lineTo(lineToSecondPoint.end.x, lineToSecondPoint.end.y)
            }

            context.stroke()

            if (isMeasurementHovered) {
              context.strokeStyle = CLOSE_INDICATOR_COLOR
              context.lineWidth = 1.5
              drawRoundedRectPath(
                context,
                textPosition.x - boxWidth / 2,
                textPosition.y - boxHeight / 2,
                boxWidth,
                boxHeight,
                6,
              )
              context.stroke()
            }

            context.fillStyle = measurementTextColor
            context.fillText(measurementValue, textPosition.x, textPosition.y)

            const insidePosition = getSegmentInsideLabelPosition(shape.points, measurement.segmentStartIndex)

            if (!insidePosition) {
              return
            }

            context.fillStyle = measurementTextColor
            context.font = '700 11px system-ui, sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillText(getMeasurementLetter(measurementIndex), insidePosition.x, insidePosition.y)
          })
        }
      }

      if (areShapeDetailsVisible) {
        context.fillStyle = displayColor
        shape.points.forEach((shapePoint) => {
          context.beginPath()
          context.arc(shapePoint.x, shapePoint.y, POINT_RADIUS, 0, Math.PI * 2)
          context.fill()
        })
      }

      const labelPosition = getShapeLabelPosition(shape.points)
      const isLabelHovered = hoveredShapeLabelIndex === index && isSelectedShape

      if (isLabelHovered) {
        context.strokeStyle = CLOSE_INDICATOR_COLOR
        context.lineWidth = 3
        context.beginPath()
        context.arc(labelPosition.x, labelPosition.y, LABEL_HOVER_RADIUS, 0, Math.PI * 2)
        context.stroke()
      }

      context.fillStyle = '#ffffff'
      context.beginPath()
      context.arc(labelPosition.x, labelPosition.y, LABEL_CIRCLE_RADIUS, 0, Math.PI * 2)
      context.fill()

      context.strokeStyle = isLabelHovered ? CLOSE_INDICATOR_COLOR : displayColor
      context.lineWidth = isLabelHovered ? 2.5 : 2
      context.beginPath()
      context.arc(labelPosition.x, labelPosition.y, LABEL_CIRCLE_RADIUS, 0, Math.PI * 2)
      context.stroke()

      context.fillStyle = isLabelHovered ? CLOSE_INDICATOR_COLOR : displayColor
      context.font = 'bold 16px system-ui, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(String(index + 1), labelPosition.x, labelPosition.y + 1)

      if (shape.showName && shape.name.trim().length > 0) {
        const namePosition = getShapeBottomCenter(shape.points)
        context.fillStyle = displayColor
        context.font = '600 14px system-ui, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(shape.name, namePosition.x, namePosition.y)
      }
    })

    context.strokeStyle = START_COLOR
    context.fillStyle = START_COLOR
    context.lineWidth = 2

    if (currentShapePoints.length > 1) {
      context.beginPath()
      context.moveTo(currentShapePoints[0].x, currentShapePoints[0].y)
      currentShapePoints.slice(1).forEach((shapePoint) => {
        context.lineTo(shapePoint.x, shapePoint.y)
      })
      context.stroke()
    }

    if (areShapeDetailsVisible) {
      currentShapePoints.forEach((shapePoint) => {
        context.beginPath()
        context.arc(shapePoint.x, shapePoint.y, POINT_RADIUS, 0, Math.PI * 2)
        context.fill()
      })
    }

    if (currentShapePoints.length >= 3) {
      const startPoint = currentShapePoints[0]
      const isStartHovered =
        hoveredPointTarget?.shapeIndex === null && hoveredPointTarget.pointIndex === 0

      if (!isStartHovered) {
        context.strokeStyle = START_COLOR
        context.lineWidth = 2
        context.beginPath()
        context.arc(startPoint.x, startPoint.y, POINT_RADIUS + 5, 0, Math.PI * 2)
        context.stroke()
      }
    }

    if (hoveredPointTarget) {
      const hoveredPoint =
        hoveredPointTarget.shapeIndex === null
          ? currentShapePoints[hoveredPointTarget.pointIndex]
          : shapes[hoveredPointTarget.shapeIndex]?.points[hoveredPointTarget.pointIndex]

      if (hoveredPoint) {
        context.strokeStyle = CLOSE_INDICATOR_COLOR
        context.lineWidth = 3
        context.beginPath()
        context.arc(hoveredPoint.x, hoveredPoint.y, POINT_RADIUS + 7, 0, Math.PI * 2)
        context.stroke()

        context.fillStyle = CLOSE_INDICATOR_COLOR
        context.beginPath()
        context.arc(hoveredPoint.x, hoveredPoint.y, POINT_RADIUS + 2, 0, Math.PI * 2)
        context.fill()

        context.fillStyle = START_COLOR
      }
    }

    const midpointTargetToRender = activeMeasurementInput
      ? {
          shapeIndex: activeMeasurementInput.shapeIndex,
          segmentStartIndex: activeMeasurementInput.segmentStartIndex,
          midpoint: activeMeasurementInput.midpoint,
        }
      : hoveredMidpointTarget

    if (midpointTargetToRender) {
      const midpointShape = shapes[midpointTargetToRender.shapeIndex]

      if (midpointShape) {
        const isSelectedMidpointShape =
          selectedShapeIndex === null || selectedShapeIndex === midpointTargetToRender.shapeIndex
        const indicatorColor = isSelectedMidpointShape ? midpointShape.color : '#94a3b8'
        const { midpoint } = midpointTargetToRender
        const isEditingThisMidpoint = isSameMidpointTarget(activeMeasurementInput, midpointTargetToRender)

        context.fillStyle = '#ffffff'
        context.beginPath()
        context.arc(midpoint.x, midpoint.y, MIDPOINT_INDICATOR_RADIUS, 0, Math.PI * 2)
        context.fill()

        context.strokeStyle = indicatorColor
        context.lineWidth = 2
        context.beginPath()
        context.arc(midpoint.x, midpoint.y, MIDPOINT_INDICATOR_RADIUS, 0, Math.PI * 2)
        context.stroke()

        if (!isEditingThisMidpoint) {
          const plusArm = MIDPOINT_INDICATOR_RADIUS - 4
          context.beginPath()
          context.moveTo(midpoint.x - plusArm, midpoint.y)
          context.lineTo(midpoint.x + plusArm, midpoint.y)
          context.moveTo(midpoint.x, midpoint.y - plusArm)
          context.lineTo(midpoint.x, midpoint.y + plusArm)
          context.stroke()
        }
      }
    }

    if (currentShapePoints.length > 0 && mousePosition) {
      const lastPoint = currentShapePoints[currentShapePoints.length - 1]

      context.beginPath()
      context.moveTo(lastPoint.x, lastPoint.y)
      context.lineTo(mousePosition.x, mousePosition.y)
      context.stroke()
    }
  }, [
    shapes,
    currentShapePoints,
    mousePosition,
    hoveredPointTarget,
    hoveredMeasuredSideTarget,
    hoveredMidpointTarget,
    hoveredMeasurementTarget,
    hoveredShapeLabelIndex,
    activeMeasurementInput,
    areShapeDetailsVisible,
    canvasSize,
    isGridEnabled,
    gridSpacing,
  ])

  return (
    <div className="drawing-canvas-wrapper">
      <aside className={`shape-menu ${selectedShape ? 'shape-menu--open' : ''}`}>
        {selectedShape && selectedShapeIndex !== null ? (
          <>
            <button
              type="button"
              className="shape-menu__close"
              onClick={() => setSelectedShapeIndex(null)}
              aria-label="Close shape menu"
            >
              Close
            </button>

            <div className="shape-menu__header">
              <div className="shape-menu__shape-id-circle">{selectedShapeIndex + 1}</div>
            </div>

            <div className="shape-menu__delete-row">
              <button
                type="button"
                className="shape-menu__delete-button"
                onClick={() => deleteShapeByIndex(selectedShapeIndex)}
                aria-label={`Delete shape ${selectedShapeIndex + 1}`}
              >
                <i className="fa-solid fa-trash" aria-hidden="true" />
              </button>
            </div>

            <div className="shape-menu__section">
              <h2 className="shape-menu__title">Shape Name</h2>
              <div className="shape-menu__name-row">
                <input
                  type="text"
                  className="shape-menu__name-input"
                  value={selectedShape.name}
                  onChange={(event) => updateShapeName(selectedShapeIndex, event.target.value)}
                  placeholder="Enter shape name"
                />
                <label className="shape-menu__name-toggle">
                  <input
                    type="checkbox"
                    checked={selectedShape.showName}
                    onChange={(event) =>
                      updateShapeNameVisibility(selectedShapeIndex, event.target.checked)
                    }
                  />
                  Show
                </label>
              </div>
            </div>

            <div className="shape-menu__section">
              <h2 className="shape-menu__title">Coordinates</h2>
              <ul className="shape-menu__coordinates">
                {selectedShape.points.map((point, index) => {
                  const isDeleteDisabled = selectedShape.points.length <= 3

                  return (
                    <li
                      key={`${selectedShapeIndex}-${index}`}
                      className={
                        highlightedCoordinateIndex === index || hoveredCoordinateIndex === index
                          ? 'shape-menu__coordinate-item shape-menu__coordinate-item--active'
                          : 'shape-menu__coordinate-item'
                      }
                      onMouseEnter={() => {
                        setHoveredCoordinateIndex(index)
                        setHoveredPointTarget({ shapeIndex: selectedShapeIndex, pointIndex: index })
                      }}
                      onMouseLeave={() => {
                        setHoveredCoordinateIndex(null)
                        setHoveredPointTarget(null)
                      }}
                    >
                      <span>
                        ({point.x.toFixed(1)}, {point.y.toFixed(1)})
                      </span>
                      <button
                        type="button"
                        className="shape-menu__coordinate-delete"
                        onClick={() => deletePointByIndex(selectedShapeIndex, index)}
                        disabled={isDeleteDisabled}
                        aria-label={`Delete point ${index + 1}`}
                        title={isDeleteDisabled ? 'A shape must keep at least 3 points.' : undefined}
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="shape-menu__section">
              <h2 className="shape-menu__title">Measurements</h2>
              <ul className="shape-menu__coordinates">
                {(selectedShape.measurements ?? []).length > 0 ? (
                  (selectedShape.measurements ?? []).map((measurement, index) => (
                    <li
                      key={`${selectedShapeIndex}-measurement-${measurement.segmentStartIndex}-${index}`}
                      className={
                        highlightedMeasurementSegmentStartIndex === measurement.segmentStartIndex
                          ? 'shape-menu__coordinate-item shape-menu__coordinate-item--active'
                          : 'shape-menu__coordinate-item'
                      }
                      onMouseEnter={() =>
                        setHoveredMeasurementTarget({
                          shapeIndex: selectedShapeIndex,
                          segmentStartIndex: measurement.segmentStartIndex,
                        })
                      }
                      onMouseLeave={() => setHoveredMeasurementTarget(null)}
                    >
                      <span>
                        {getMeasurementLetter(index)}: {measurement.value}
                      </span>

                      <button
                        type="button"
                        className="shape-menu__coordinate-delete"
                        onClick={() =>
                          deleteMeasurementBySegment(selectedShapeIndex, measurement.segmentStartIndex)
                        }
                        aria-label={`Delete measurement ${getMeasurementLetter(index)}`}
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="shape-menu__coordinate-item">
                    <span>No measurements added yet.</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="shape-menu__section">
              <h2 className="shape-menu__title">Color Palette</h2>
              <p className="shape-menu__hint">Click a color dot to update this shape.</p>
              <div className="shape-menu__colors">
                {STANDARD_COLORS.map((color) => {
                  const isSelected = color === selectedShape.color

                  return (
                    <button
                      key={`${selectedShapeIndex}-${color}`}
                      type="button"
                      className={`shape-menu__color ${isSelected ? 'shape-menu__color--selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => updateShapeColor(selectedShapeIndex, color)}
                      aria-label={`Set shape color to ${color}`}
                    />
                  )
                })}
              </div>
            </div>
          </>
        ) : null}
      </aside>

      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        style={{
          cursor:
            draggingShapeLabelIndex !== null || draggingShapeBodyIndex !== null || draggingSideTarget !== null
              ? 'grabbing'
              : hoveredShapeLabelIndex !== null ||
                  hoveredMeasurementTarget !== null ||
                  hoveredMidpointTarget !== null
                ? 'pointer'
                : hoveredShapeBodyIndex !== null || hoveredMeasuredSideTarget !== null
                  ? 'grab'
                  : 'crosshair',
        }}
        onClick={handleCanvasClick}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleCanvasMouseUp}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        aria-label="Shape drawing canvas"
      />

      {activeMeasurementInput ? (
        <div
          className="measurement-editor"
          style={{
            left: `${activeMeasurementInput.midpoint.x}px`,
            top: `${activeMeasurementInput.midpoint.y}px`,
          }}
        >
          <input
            ref={measurementInputRef}
            type="text"
            inputMode="text"
            className="measurement-input"
            value={activeMeasurementInput.value}
            onChange={(event) => handleMeasurementInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitMeasurementInput()
                return
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                cancelMeasurementInput()
              }
            }}
            aria-label="Segment measurement"
          />

          <button
            type="button"
            className="measurement-editor__action"
            onClick={commitMeasurementInput}
            aria-label="Accept measurement changes"
            title="Accept"
          >
            <i className="fa-solid fa-check" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="measurement-editor__action"
            onClick={cancelMeasurementInput}
            aria-label="Cancel measurement changes"
            title="Cancel"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="grid-controls">
        <button
          type="button"
          className={`grid-toggle grid-download ${areShapeDetailsVisible ? 'grid-toggle--active' : ''}`}
          onClick={() => setAreShapeDetailsVisible((previous) => !previous)}
          aria-label={areShapeDetailsVisible ? 'Hide points and measurements' : 'Show points and measurements'}
          title={areShapeDetailsVisible ? 'Hide points and measurements' : 'Show points and measurements'}
        >
          <i className={`fa-solid ${areShapeDetailsVisible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="grid-toggle grid-download"
          onClick={exportSelectedShapeAsSvg}
          disabled={selectedShapeIndex === null}
          aria-label="Download shape SVG"
          title={selectedShapeIndex === null ? 'Select a shape to download SVG' : 'Download shape SVG'}
        >
          <i className="fa-solid fa-download" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`grid-toggle ${isGridEnabled ? 'grid-toggle--active' : ''}`}
          onClick={() => setIsGridEnabled((previous) => !previous)}
        >
          Grid
        </button>

        {isGridEnabled ? (
          <input
            className="grid-slider"
            type="range"
            min={0}
            max={2}
            step={1}
            value={gridSettingIndex}
            onChange={(event) => setGridSettingIndex(Number(event.target.value))}
            aria-label="Grid spacing"
          />
        ) : null}
      </div>
    </div>
  )
}

export default DrawingCanvas
