import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Chart from "chart.js/auto";

type AssetAllocationChartProps = {
  isLoading: boolean;
};

export default function AssetAllocationChart({ isLoading }: AssetAllocationChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  // Mock data for the asset allocation
  const data = {
    labels: ['Stocks', 'Crypto', 'Cash'],
    data: [58, 28, 14],
    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
  };

  useEffect(() => {
    if (isLoading || !chartRef.current) return;

    // Destroy previous chart instance if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    chartInstance.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.data,
          backgroundColor: data.backgroundColor,
          borderWidth: 0
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
            callbacks: {
              label: function(context) {
                return context.label + ': ' + context.parsed + '%';
              }
            }
          }
        },
        cutout: '70%'
      }
    });

    // Cleanup on unmount
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="w-full h-64" />
        <div className="space-y-3">
          <div className="flex items-center">
            <Skeleton className="w-3 h-3 rounded-full mr-2" />
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-10 h-4 ml-auto" />
          </div>
          <div className="flex items-center">
            <Skeleton className="w-3 h-3 rounded-full mr-2" />
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-10 h-4 ml-auto" />
          </div>
          <div className="flex items-center">
            <Skeleton className="w-3 h-3 rounded-full mr-2" />
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-10 h-4 ml-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="chart-container h-64">
        <canvas ref={chartRef}></canvas>
      </div>
      <div className="mt-4 space-y-3">
        {data.labels.map((label, index) => (
          <div className="flex items-center" key={label}>
            <span 
              className="w-3 h-3 rounded-full mr-2" 
              style={{ backgroundColor: data.backgroundColor[index] }}
            ></span>
            <span className="text-sm font-medium text-gray-600">{label}</span>
            <span className="ml-auto text-sm font-medium text-gray-900">{data.data[index]}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
