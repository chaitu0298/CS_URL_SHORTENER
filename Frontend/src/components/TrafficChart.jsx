import React from 'react';
import {dailySeries,compactNumber} from '../lib/format.js';

export default function TrafficChart({dailyClicks, days=14}) {
  const points=dailySeries(dailyClicks,days);
  const max=Math.max(1,...points.map(point=>point.clicks));
  const total=points.reduce((sum,point)=>sum+point.clicks,0);
  return <div className="traffic-chart">
    <div className="chart-summary"><span>Last {days} days</span><strong>{compactNumber(total)} <small>clicks</small></strong></div>
    <div className="chart-area" role="img" aria-label={`Bar chart of daily clicks for the past ${days} days. Total ${total} clicks.`}>
      {points.map((point,index)=><div key={point.date} className="chart-column" title={`${point.label}: ${point.clicks} clicks`}>
        <div className="bar-rail"><div className={`chart-bar ${index===points.length-1?'latest':''}`} style={{height:`${point.clicks===0?3:Math.max(8,point.clicks/max*100)}%`}} /></div>
        <span className="bar-label">{index%3===0 || index===points.length-1?point.label:''}</span>
      </div>)}
    </div>
  </div>;
}
