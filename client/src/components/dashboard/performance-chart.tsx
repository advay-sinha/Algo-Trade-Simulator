import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Chart from "chart.js/auto";

type PerformanceChartProps = {
  period: string;
  isLoading: boolean;
};

export default function PerformanceChart({ period, isLoading }: PerformanceChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  // Mock data based on the selected period
  const getMockData = () => {
    switch (period) {
      case "1D":
        return {
          labels: ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'],
          data: [125000, 124800, 126300, 126800, 127200, 127800, 127500, 128450]
        };
      case "1W":
        return {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          data: [124000, 125500, 125000, 126200, 127500, 127800, 128450]
        };
      case "1M":
        return {
          labels: Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`),
          data: Array.from({ length: 30 }, (_, i) => 120000 + (i * 300))
        };
      default:
        return {
          labels: ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'],
          data: [125000, 124800, 126300, 126800, 127200, 127800, 127500, 128450]
        };
    }
  };

  useEffect(() => {
    if (isLoading || !chartRef.current) return;

    // Destroy previous chart instance if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const { labels, data } = getMockData();

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Portfolio Value',
          data,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#2563eb'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    minimumFractionDigits: 0
                  }).format(context.parsed.y);
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            }
          },
          y: {
            grid: {
              borderDash: [2, 4],
              color: '#e5e7eb'
            },
            ticks: {
              callback: function(value) {
                return '₹' + value.toLocaleString('en-IN');
              }
            }
          }
        }
      }
    });

    // Cleanup on unmount
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [period, isLoading]);

  if (isLoading) {
    return <Skeleton className="w-full h-[300px]" />;
  }

  return (
    <div className="chart-container" style={{ position: "relative", height: "300px", width: "100%" }}>
      <canvas ref={chartRef}></canvas>
    </div>
  );
}
