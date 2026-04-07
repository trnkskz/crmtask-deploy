import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable, tap } from 'rxjs'

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now()
    const req = context.switchToHttp().getRequest() as any
    const method = req?.method
    const url = req?.url
    const rid = req?.requestId
    const user = req?.user
    return next.handle().pipe(
      tap(() => {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            type: 'http_access',
            method,
            url,
            status: context.switchToHttp().getResponse()?.statusCode,
            ms: Date.now() - now,
            requestId: rid,
            user: user ? { id: user.id, role: user.role } : undefined,
          }),
        )
      }),
    )
  }
}

