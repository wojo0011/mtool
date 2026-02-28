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
}

type PointTarget = {
  shapeIndex: number | null
  pointIndex: number
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
const GRID_SPACING_OPTIONS = [20, 32, 48]

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
    y: maxY - 10,
  }
}

function DrawingCanvas() {
  const [shapes, setShapes] = useState<Shape[]>([])
  const [currentShapePoints, setCurrentShapePoints] = useState<Point[]>([])
  const [mousePosition, setMousePosition] = useState<Point | null>(null)
  const [hoveredPointTarget, setHoveredPointTarget] = useState<PointTarget | null>(null)
  const [draggingPointTarget, setDraggingPointTarget] = useState<PointTarget | null>(null)
  const [hoveredShapeLabelIndex, setHoveredShapeLabelIndex] = useState<number | null>(null)
  const [draggingShapeLabelIndex, setDraggingShapeLabelIndex] = useState<number | null>(null)
  const [shapeDragLastMousePosition, setShapeDragLastMousePosition] = useState<Point | null>(null)
  const [selectedShapeIndex, setSelectedShapeIndex] = useState<number | null>(null)
  const [isGridEnabled, setIsGridEnabled] = useState(false)
  const [gridSettingIndex, setGridSettingIndex] = useState(1)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
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

  const closeCurrentShape = (points: Point[]) => {
    setShapes((previous) => [...previous, { points, color: START_COLOR, name: '', showName: false }])
    setCurrentShapePoints([])
    setMousePosition(null)
    setHoveredPointTarget(null)
    setDraggingPointTarget(null)
    setHoveredShapeLabelIndex(null)
    setDraggingShapeLabelIndex(null)
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
      const labelPosition = getPolygonCentroid(shapes[shapeIndex].points)

      if (getDistance(point, labelPosition) <= LABEL_HOVER_RADIUS) {
        return shapeIndex
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
    setSelectedShapeIndex(null)
    setHoveredShapeLabelIndex(null)
    setDraggingShapeLabelIndex(null)
    setShapeDragLastMousePosition(null)
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

    const nearbyShapeLabelIndex = findNearbyShapeLabel(point)

    if (nearbyShapeLabelIndex !== null) {
      setDraggingShapeLabelIndex(nearbyShapeLabelIndex)
      setShapeDragLastMousePosition(point)
      setHoveredShapeLabelIndex(nearbyShapeLabelIndex)
      hasDraggedPointRef.current = false
      return
    }

    const nearbyPoint = findNearbyPoint(point)

    if (nearbyPoint) {
      setDraggingPointTarget(nearbyPoint)
      hasDraggedPointRef.current = false
    }
  }

  const handleCanvasMouseUp = () => {
    setDraggingPointTarget(null)
    setDraggingShapeLabelIndex(null)
    setShapeDragLastMousePosition(null)
  }

  const handleCanvasMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasCoordinates(event)

    if (!point) {
      return
    }

    setMousePosition(point)

    if (draggingShapeLabelIndex !== null && shapeDragLastMousePosition) {
      const deltaX = point.x - shapeDragLastMousePosition.x
      const deltaY = point.y - shapeDragLastMousePosition.y

      if (deltaX !== 0 || deltaY !== 0) {
        moveShapeByDelta(draggingShapeLabelIndex, deltaX, deltaY)
        hasDraggedPointRef.current = true
      }

      setShapeDragLastMousePosition(point)
      setHoveredShapeLabelIndex(draggingShapeLabelIndex)
      setHoveredPointTarget(null)
      return
    }

    if (draggingPointTarget) {
      updatePointByTarget(draggingPointTarget, snapPointToGrid(point))
      setHoveredPointTarget(draggingPointTarget)
      setHoveredShapeLabelIndex(null)
      hasDraggedPointRef.current = true
      return
    }

    const nearbyShapeLabelIndex = findNearbyShapeLabel(point)

    if (nearbyShapeLabelIndex !== null) {
      setHoveredShapeLabelIndex(nearbyShapeLabelIndex)
      setHoveredPointTarget(null)
      return
    }

    setHoveredShapeLabelIndex(null)

    const nearbyPoint = findNearbyPoint(point)
    setHoveredPointTarget(nearbyPoint)

    if (nearbyPoint) {
      return
    }

    if (currentShapePoints.length >= 3) {
      const first = currentShapePoints[0]
      const distanceToStart = getDistance(point, first)
      if (distanceToStart <= CLOSE_DISTANCE) {
        setHoveredPointTarget({ shapeIndex: null, pointIndex: 0 })
      }
      return
    }
  }

  const handleCanvasMouseLeave = () => {
    setMousePosition(null)
    setHoveredPointTarget(null)
    setHoveredShapeLabelIndex(null)
    setDraggingPointTarget(null)
    setDraggingShapeLabelIndex(null)
    setShapeDragLastMousePosition(null)
    hasDraggedPointRef.current = false
  }

  const selectedShape = selectedShapeIndex !== null ? shapes[selectedShapeIndex] : null
  const highlightedCoordinateIndex =
    selectedShapeIndex !== null && hoveredPointTarget?.shapeIndex === selectedShapeIndex
      ? hoveredPointTarget.pointIndex
      : null

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
      }

      context.fillStyle = displayColor
      shape.points.forEach((shapePoint) => {
        context.beginPath()
        context.arc(shapePoint.x, shapePoint.y, POINT_RADIUS, 0, Math.PI * 2)
        context.fill()
      })

      const labelPosition = getPolygonCentroid(shape.points)
      const isLabelHovered = hoveredShapeLabelIndex === index && isSelectedShape

      if (isLabelHovered) {
        context.strokeStyle = CLOSE_INDICATOR_COLOR
        context.lineWidth = 3
        context.beginPath()
        context.arc(labelPosition.x, labelPosition.y, LABEL_HOVER_RADIUS, 0, Math.PI * 2)
        context.stroke()
      }

      context.fillStyle = isLabelHovered ? CLOSE_INDICATOR_COLOR : displayColor
      context.font = 'bold 16px system-ui, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(String(index + 1), labelPosition.x, labelPosition.y)

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

    currentShapePoints.forEach((shapePoint) => {
      context.beginPath()
      context.arc(shapePoint.x, shapePoint.y, POINT_RADIUS, 0, Math.PI * 2)
      context.fill()
    })

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
    hoveredShapeLabelIndex,
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
                {selectedShape.points.map((point, index) => (
                  <li
                    key={`${selectedShapeIndex}-${index}`}
                    className={
                      highlightedCoordinateIndex === index
                        ? 'shape-menu__coordinate-item shape-menu__coordinate-item--active'
                        : 'shape-menu__coordinate-item'
                    }
                  >
                    ({point.x.toFixed(1)}, {point.y.toFixed(1)})
                  </li>
                ))}
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
        onClick={handleCanvasClick}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleCanvasMouseUp}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        aria-label="Shape drawing canvas"
      />

      <div className="grid-controls">
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
