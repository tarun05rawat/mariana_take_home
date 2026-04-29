import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const mapViewMock = vi.fn();

vi.mock("./components/MapView", () => ({
  default: (props: {
    center: [number, number];
    radiusKm: number;
    onSelect: (value: [number, number]) => void;
  }) => {
    mapViewMock(props);
    return (
      <div data-testid="map-view">
        <button onClick={() => props.onSelect([37.8, -122.27])} type="button">
          Mock map click
        </button>
        <span data-testid="map-radius">{props.radiusKm}</span>
        <span data-testid="map-center">
          {props.center[0].toFixed(4)},{props.center[1].toFixed(4)}
        </span>
      </div>
    );
  },
}));

describe("App", () => {
  beforeEach(() => {
    mapViewMock.mockClear();
    vi.restoreAllMocks();
  });

  it("loads the default summary on first render", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 541797,
            busStops: 3428,
            tramStops: 740,
            trainMetroStops: 63,
          }),
        ),
      );

    render(<App />);

    expect(await screen.findByText("541,797")).toBeInTheDocument();
    expect(screen.getByText("3,428")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/summary?lat=37.7749&lon=-122.4194&radiusKm=5",
    );
  });

  it("refetches when the radius slider changes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 541797,
            busStops: 3428,
            tramStops: 740,
            trainMetroStops: 63,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 904658,
            busStops: 6076,
            tramStops: 1089,
            trainMetroStops: 93,
          }),
        ),
      );

    render(<App />);
    await screen.findByText("541,797");

    fireEvent.change(screen.getByLabelText("Radius: 5 km"), {
      target: { value: "10" },
    });

    await screen.findByText("904,658");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/summary?lat=37.7749&lon=-122.4194&radiusKm=10",
    );
    expect(screen.getByText("Radius:")).toBeInTheDocument();
    expect(screen.getByText("10 km")).toBeInTheDocument();
    expect(screen.getByTestId("map-radius")).toHaveTextContent("10");
  });

  it("refetches when the map selection changes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 541797,
            busStops: 3428,
            tramStops: 740,
            trainMetroStops: 63,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 211234,
            busStops: 1098,
            tramStops: 124,
            trainMetroStops: 19,
          }),
        ),
      );

    render(<App />);
    await screen.findByText("541,797");

    fireEvent.click(screen.getByRole("button", { name: "Mock map click" }));

    await screen.findByText("211,234");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/summary?lat=37.8&lon=-122.27&radiusKm=5",
    );
    await waitFor(() => {
      expect(screen.getByText(/Selected point: 37\.8000, -122\.2700/)).toBeVisible();
    });
  });

  it("shows an error state when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 500 }));

    render(<App />);

    expect(
      await screen.findByText("Request failed with status 500"),
    ).toBeInTheDocument();
  });
});
