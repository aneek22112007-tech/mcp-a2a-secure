import React from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDashboardStore } from '../../store/dashboardStore';

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(0,0,0,0.95)',
        border: '1px solid rgba(254,110,68,0.3)',
        borderRadius: '6px',
        padding: '0.75rem',
        fontFamily: 'var(--font-body)',
      }}>
        {payload.map((entry: any, index: number) => (
          <div key={index} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: index < payload.length - 1 ? '0.4rem' : 0,
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              background: entry.color,
              borderRadius: '50%',
            }} />
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
              {entry.name}:
            </span>
            <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600 }}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const ActivityGraph: React.FC = () => {
  const { activityMetrics, activityTimeRange, setActivityTimeRange } = useDashboardStore();

  const timeRanges: Array<'1H' | '6H' | '24H' | '7D'> = ['1H', '6H', '24H', '7D'];

  // Format data for chart
  const chartData = activityMetrics.map(metric => {
    const date = new Date(metric.timestamp);
    return {
      time: activityTimeRange === '7D' 
        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      'Tool Calls': metric.toolCalls,
      'Blocked': metric.blockedRequests,
      'Violations': metric.policyViolations,
      'Connections': metric.connections,
    };
  });

  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
      padding: '1.5rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.95rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#fff',
            marginBottom: '0.25rem',
          }}>
            ACTIVITY
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            color: 'rgba(255,255,255,0.4)',
          }}>
            Real-time infrastructure metrics
          </div>
        </div>

        {/* Time Range Selector */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          background: 'rgba(0,0,0,0.3)',
          padding: '0.25rem',
          borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {timeRanges.map(range => (
            <button
              key={range}
              onClick={() => setActivityTimeRange(range)}
              style={{
                padding: '0.4rem 0.75rem',
                background: activityTimeRange === range ? 'rgba(254,110,68,0.15)' : 'transparent',
                border: activityTimeRange === range ? '1px solid rgba(254,110,68,0.3)' : '1px solid transparent',
                borderRadius: '4px',
                color: activityTimeRange === range ? '#FE6E44' : 'rgba(255,255,255,0.5)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (activityTimeRange !== range) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (activityTimeRange !== range) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={{ height: '300px' }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <XAxis
              dataKey="time"
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.2)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{
                paddingTop: '20px',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
              }}
              iconType="circle"
            />
            <Line
              type="monotone"
              dataKey="Tool Calls"
              stroke="#FE6E44"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#FE6E44' }}
            />
            <Line
              type="monotone"
              dataKey="Connections"
              stroke="#7CFF4F"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#7CFF4F' }}
            />
            <Line
              type="monotone"
              dataKey="Blocked"
              stroke="#ff4444"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#ff4444' }}
            />
            <Line
              type="monotone"
              dataKey="Violations"
              stroke="#ffaa00"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#ffaa00' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
};
