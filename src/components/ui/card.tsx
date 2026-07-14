import * as React from 'react';import{cn}from'@/lib/utils'
export const Card=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('rounded-2xl border border-border/70 bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,.03),0_12px_40px_rgba(15,23,42,.04)]',className)}{...p}/>);Card.displayName='Card'
export const CardHeader=({className,...p}:React.HTMLAttributes<HTMLDivElement>)=><div className={cn('flex flex-col gap-1.5 p-5',className)}{...p}/>
export const CardTitle=({className,...p}:React.HTMLAttributes<HTMLHeadingElement>)=><h3 className={cn('font-display text-lg font-semibold tracking-tight',className)}{...p}/>
export const CardDescription=({className,...p}:React.HTMLAttributes<HTMLParagraphElement>)=><p className={cn('text-sm text-muted-foreground',className)}{...p}/>
export const CardContent=({className,...p}:React.HTMLAttributes<HTMLDivElement>)=><div className={cn('p-5 pt-0',className)}{...p}/>
